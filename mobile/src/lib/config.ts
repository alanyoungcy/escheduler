import Constants from "expo-constants";

type PublicConfig = {
  apiUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabasePublishableKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? Constants.manifest2?.extra ?? {}) as PublicConfig;

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? "https://escheduler.vercel.app";
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl;
export const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  extra.supabaseAnonKey ??
  extra.supabasePublishableKey;
