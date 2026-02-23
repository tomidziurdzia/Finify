import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    redirect("/");
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">Finify</h1>
        <p className="text-muted-foreground text-sm">
          Ingresá con tu email y contraseña.
        </p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
