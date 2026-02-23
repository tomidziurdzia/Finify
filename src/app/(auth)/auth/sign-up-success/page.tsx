import Link from "next/link";

export default function SignUpSuccessPage() {
  return (
    <div className="w-full max-w-sm space-y-4 text-center">
      <h1 className="text-2xl font-bold">Revisá tu email</h1>
      <p className="text-muted-foreground text-sm">
        Te enviamos un link de acceso. Hacé click en el link para ingresar.
      </p>
      <Link href="/auth/login" className="text-sm underline underline-offset-4">
        Volver al login
      </Link>
    </div>
  );
}
