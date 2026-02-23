import Link from "next/link";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ?? "Ocurrió un error de autenticación.";

  return (
    <div className="w-full max-w-sm space-y-4 text-center">
      <h1 className="text-2xl font-bold">Error de autenticación</h1>
      <p className="text-muted-foreground text-sm">{error}</p>
      <Link href="/auth/login" className="text-sm underline underline-offset-4">
        Volver al login
      </Link>
    </div>
  );
}
