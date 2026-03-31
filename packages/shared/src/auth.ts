import { AuthError } from "./errors.js";
import type { AuthMaterial, FastmailAuthMaterial, OAuthAuthMaterial } from "./types.js";

export function isFastmailAuthMaterial(auth: AuthMaterial): auth is FastmailAuthMaterial {
  return auth.kind === "fastmail-basic";
}

export function isOAuthAuthMaterial(auth: AuthMaterial): auth is OAuthAuthMaterial {
  return auth.kind === "oauth";
}

export function assertFastmailAuthMaterial(auth: AuthMaterial): FastmailAuthMaterial {
  if (!isFastmailAuthMaterial(auth)) {
    throw new AuthError("Fastmail provider requires Fastmail-style credentials.");
  }

  return auth;
}

export function assertOAuthAuthMaterial(auth: AuthMaterial): OAuthAuthMaterial {
  if (!isOAuthAuthMaterial(auth)) {
    throw new AuthError("OAuth-backed provider requires OAuth credentials.");
  }

  return auth;
}
