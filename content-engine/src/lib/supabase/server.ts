import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv, supabaseConfigured } from "@/lib/env";

export async function getSignedInUserId(): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          for (const c of list) cookieStore.set(c.name, c.value, c.options);
        } catch {
          // Called from a Server Component; ignore. Middleware refreshes cookies.
        }
      },
    },
  });
}
