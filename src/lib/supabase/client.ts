import { createBrowserClient } from "@supabase/ssr";

// TODO: Re-add Database generic after running: npx supabase gen types typescript
// import type { Database } from "@/types/database.types";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
