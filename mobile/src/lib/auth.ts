import "react-native-url-polyfill/auto";

import { createClient, type Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { SUPABASE_KEY, SUPABASE_URL } from "./config";

export type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: number;
  user: {
    sub?: string;
    email?: string;
    name?: string;
  };
};

export type AuthResult = {
  session: AuthSession | null;
  message?: string;
};

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: Platform.OS === "web",
        persistSession: true,
        storage: Platform.OS === "web" ? undefined : AsyncStorage
      }
    })
  : null;

function getSupabase() {
  if (!supabase) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required for auth");
  }
  return supabase;
}

function toAuthSession(session: Session): AuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    tokenType: session.token_type,
    expiresAt: session.expires_at ? session.expires_at * 1000 : undefined,
    user: {
      sub: session.user.id,
      email: session.user.email ?? undefined,
      name: typeof session.user.user_metadata.name === "string" ? session.user.user_metadata.name : undefined
    }
  };
}

export async function loadStoredSession(): Promise<AuthSession | null> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) {
    throw error;
  }
  return data.session ? toAuthSession(data.session) : null;
}

export async function clearSession() {
  const { error } = await getSupabase().auth.signOut();
  if (error) {
    throw error;
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthSession> {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email: email.trim(),
    password
  });
  if (error) {
    throw error;
  }
  if (!data.session) {
    throw new Error("Sign-in did not return a session");
  }
  return toAuthSession(data.session);
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const redirectTo = typeof window === "undefined" ? undefined : window.location.origin;
  const { data, error } = await getSupabase().auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: redirectTo
    }
  });
  if (error) {
    throw error;
  }
  return {
    session: data.session ? toAuthSession(data.session) : null,
    message: data.session ? undefined : "Account created. Check your email to confirm it before signing in."
  };
}
