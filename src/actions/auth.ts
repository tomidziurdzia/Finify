"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T> = { data: T } | { error: string };

const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function loginWithPassword(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = LoginInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Datos de inicio de sesión inválidos",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      return { error: error.message };
    }

    return { data: null };
  } catch {
    return { error: "Error al iniciar sesión" };
  }
}

