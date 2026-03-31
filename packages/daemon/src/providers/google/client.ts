import { getSecretStore, type AccountConfig, type OAuthAuthMaterial } from "@iomancer/mail-agent-shared";

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function joinUrl(base: string, path: string): string {
  const normalized = path.replace(/^\//, "");
  const relativePath = normalized.includes(":") && !normalized.includes("/")
    ? `./${normalized}`
    : normalized;
  return new URL(relativePath, ensureTrailingSlash(base)).toString();
}

function toSearchParams(query: Record<string, string | number | boolean | undefined | Array<string>>): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "undefined") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry);
      }
      continue;
    }

    params.set(key, String(value));
  }

  return params;
}

export class GoogleApiClient {
  constructor(
    private readonly account: AccountConfig,
    private auth: OAuthAuthMaterial
  ) {}

  private isTokenFresh(): boolean {
    if (!this.auth.expiresAt) {
      return true;
    }

    return Date.parse(this.auth.expiresAt) - Date.now() > 60_000;
  }

  private async refreshAccessToken(): Promise<void> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.auth.refreshToken,
      client_id: this.auth.clientId
    });

    if (this.auth.clientSecret) {
      body.set("client_secret", this.auth.clientSecret);
    }

    const response = await fetch(this.auth.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh OAuth token for ${this.account.id}: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as {
      access_token: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
      refresh_token?: string;
    };

    this.auth = {
      ...this.auth,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? this.auth.refreshToken,
      expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : this.auth.expiresAt,
      scopes: payload.scope ? payload.scope.split(" ").filter(Boolean) : this.auth.scopes,
      tokenType: payload.token_type ?? this.auth.tokenType
    };

    await getSecretStore().save(this.account.id, this.auth);
  }

  async getAccessToken(): Promise<string> {
    if (!this.isTokenFresh()) {
      await this.refreshAccessToken();
    }

    return this.auth.accessToken;
  }

  async requestJson<T>(
    baseUrl: string,
    path: string,
    options?: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      query?: Record<string, string | number | boolean | undefined | Array<string>>;
      body?: unknown;
      headers?: Record<string, string>;
      retryOnUnauthorized?: boolean;
    }
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = new URL(joinUrl(baseUrl, path));
    if (options?.query) {
      const params = toSearchParams(options.query);
      params.forEach((value, key) => url.searchParams.append(key, value));
    }

    const response = await fetch(url, {
      method: options?.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(options?.body ? { "content-type": "application/json" } : {}),
        ...options?.headers
      },
      body: options?.body ? JSON.stringify(options.body) : undefined
    });

    if (response.status === 401 && options?.retryOnUnauthorized !== false) {
      await this.refreshAccessToken();
      return await this.requestJson<T>(baseUrl, path, {
        ...options,
        retryOnUnauthorized: false
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API request failed (${response.status}) for ${url.toString()}: ${errorText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
