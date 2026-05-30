const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_CLIENT_ID =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const STORAGE_KEY = "escheduler.auth.session";
const STATE_KEY = "escheduler.auth.state";
const VERIFIER_KEY = "escheduler.auth.verifier";

export type AuthSession = {
  accessToken: string;
  idToken?: string;
  tokenType: string;
  expiresAt?: number;
  user: {
    sub?: string;
    email?: string;
    name?: string;
  };
};

function authEndpoint(path: string) {
  if (!SUPABASE_URL) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL is required for auth");
  }
  return `${SUPABASE_URL}${path}`;
}

function redirectUri() {
  return window.location.origin;
}

function base64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes)
    .map((value) => String.fromCharCode(value))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(size: number) {
  const bytes = new Uint8Array(size);
  window.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return base64Url(new Uint8Array(digest));
}

function parseJwt(token?: string) {
  if (!token) {
    return {};
  }
  const [, payload] = token.split(".");
  if (!payload) {
    return {};
  }
  const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(decoded) as Record<string, string | number>;
}

export function loadStoredSession(): AuthSession | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  const session = JSON.parse(raw) as AuthSession;
  if (session.expiresAt && Date.now() > session.expiresAt) {
    clearSession();
    return null;
  }
  return session;
}

export function clearSession() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export async function beginAuth() {
  if (!SUPABASE_CLIENT_ID) {
    throw new Error("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY is required");
  }
  const state = randomString(32);
  const verifier = randomString(48);
  const challenge = await sha256(verifier);

  window.localStorage.setItem(STATE_KEY, state);
  window.localStorage.setItem(VERIFIER_KEY, verifier);

  const url = new URL(authEndpoint("/auth/v1/oauth/authorize"));
  url.searchParams.set("client_id", SUPABASE_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  window.location.assign(url.toString());
}

export async function completeAuthFromUrl(): Promise<AuthSession | null> {
  const current = new URL(window.location.href);
  const code = current.searchParams.get("code");
  const state = current.searchParams.get("state");
  if (!code) {
    return null;
  }
  const expectedState = window.localStorage.getItem(STATE_KEY);
  const verifier = window.localStorage.getItem(VERIFIER_KEY);
  if (!state || state !== expectedState || !verifier) {
    throw new Error("OAuth state verification failed");
  }
  if (!SUPABASE_CLIENT_ID) {
    throw new Error("Missing public Supabase client id");
  }

  const response = await fetch(authEndpoint("/auth/v1/oauth/token"), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: SUPABASE_CLIENT_ID,
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier
    }).toString()
  });

  if (!response.ok) {
    throw new Error(`OAuth token exchange failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    id_token?: string;
    token_type: string;
    expires_in?: number;
  };

  const claims = parseJwt(payload.id_token ?? payload.access_token);
  const session: AuthSession = {
    accessToken: payload.access_token,
    idToken: payload.id_token,
    tokenType: payload.token_type,
    expiresAt: payload.expires_in ? Date.now() + payload.expires_in * 1000 : undefined,
    user: {
      sub: typeof claims.sub === "string" ? claims.sub : undefined,
      email: typeof claims.email === "string" ? claims.email : undefined,
      name: typeof claims.name === "string" ? claims.name : undefined
    }
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.localStorage.removeItem(STATE_KEY);
  window.localStorage.removeItem(VERIFIER_KEY);
  current.searchParams.delete("code");
  current.searchParams.delete("state");
  window.history.replaceState({}, "", current.toString());
  return session;
}
