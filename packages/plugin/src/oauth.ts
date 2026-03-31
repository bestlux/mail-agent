import crypto from "node:crypto";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function createCodeVerifier(): string {
  return base64UrlEncode(crypto.randomBytes(64));
}

function createCodeChallenge(codeVerifier: string): string {
  return base64UrlEncode(crypto.createHash("sha256").update(codeVerifier).digest());
}

async function openBrowser(url: string): Promise<void> {
  try {
    if (process.platform === "win32") {
      await execFileAsync("powershell", ["-NoProfile", "-Command", "Start-Process", url]);
      return;
    }

    if (process.platform === "darwin") {
      await execFileAsync("open", [url]);
      return;
    }

    await execFileAsync("xdg-open", [url]);
  } catch {
    // Fall back to printing the URL for manual open.
  }
}

async function listenForCallback(host: string, preferredPort?: number): Promise<{
  redirectUri: string;
  waitForCode: (expectedState: string) => Promise<{ code: string }>;
  close: () => Promise<void>;
}> {
  let resolveCode: ((value: { code: string }) => void) | undefined;
  let rejectCode: ((error: Error) => void) | undefined;

  const waitForCode = (expectedState: string) =>
    new Promise<{ code: string }>((resolve, reject) => {
      resolveCode = (value) => resolve(value);
      rejectCode = reject;

      const timer = setTimeout(() => reject(new Error("Timed out waiting for OAuth redirect.")), 5 * 60 * 1000);
      const originalResolve = resolveCode;
      const originalReject = rejectCode;
      resolveCode = (value) => {
        clearTimeout(timer);
        originalResolve?.(value);
      };
      rejectCode = (error) => {
        clearTimeout(timer);
        originalReject?.(error);
      };

      server.on("request", (_request, _response) => {
        void expectedState;
      });
    });

  const server = http.createServer((request, response) => {
    try {
      const target = new URL(request.url ?? "/", "http://127.0.0.1");
      const state = target.searchParams.get("state");
      const code = target.searchParams.get("code");
      const error = target.searchParams.get("error");

      if (error) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        response.end("<html><body><p>Authorization failed. You can close this tab.</p></body></html>");
        rejectCode?.(new Error(`OAuth authorization failed: ${error}`));
        return;
      }

      if (!state || state !== serverState.expectedState) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        response.end("<html><body><p>State mismatch. You can close this tab.</p></body></html>");
        rejectCode?.(new Error("OAuth state mismatch."));
        return;
      }

      if (!code) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        response.end("<html><body><p>Missing authorization code. You can close this tab.</p></body></html>");
        rejectCode?.(new Error("Missing OAuth authorization code."));
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<html><body><p>Authorization complete. You can close this tab and return to mail-agent.</p></body></html>");
      resolveCode?.({ code });
    } catch (error) {
      rejectCode?.(error as Error);
    }
  });

  const serverState = {
    expectedState: ""
  };

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(preferredPort ?? 0, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine OAuth redirect address.");
  }

  return {
    redirectUri: `http://${host}:${address.port}`,
    waitForCode: async (expectedState: string) => {
      serverState.expectedState = expectedState;
      return await waitForCode(expectedState);
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

export async function runLoopbackOAuth(options: {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  redirectHost: string;
  redirectPort?: number;
  loginHint?: string;
  prompt?: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
  scopes: string[];
  tokenType?: string;
  redirectUri: string;
}> {
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  const state = crypto.randomUUID();
  const callback = await listenForCallback(options.redirectHost, options.redirectPort);

  try {
    const authUrl = new URL(options.authorizationUrl);
    authUrl.searchParams.set("client_id", options.clientId);
    authUrl.searchParams.set("redirect_uri", callback.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", options.scopes.join(" "));
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("prompt", options.prompt ?? "consent");
    if (options.loginHint) {
      authUrl.searchParams.set("login_hint", options.loginHint);
    }

    console.log(`Open this URL in your browser to authorize mail-agent:\n${authUrl.toString()}\n`);
    await openBrowser(authUrl.toString());

    const { code } = await callback.waitForCode(state);
    const body = new URLSearchParams({
      client_id: options.clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: callback.redirectUri
    });

    if (options.clientSecret) {
      body.set("client_secret", options.clientSecret);
    }

    const response = await fetch(options.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth token exchange failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    if (!payload.refresh_token) {
      throw new Error("OAuth token exchange did not return a refresh token. Re-consent may be required.");
    }

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : undefined,
      scopes: payload.scope ? payload.scope.split(" ").filter(Boolean) : options.scopes,
      tokenType: payload.token_type,
      redirectUri: callback.redirectUri
    };
  } finally {
    await callback.close();
  }
}
