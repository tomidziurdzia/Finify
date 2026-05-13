export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-4 sm:p-6">
      {children}
    </div>
  );
}
