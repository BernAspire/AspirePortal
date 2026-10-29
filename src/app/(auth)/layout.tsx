import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col bg-brand-surface">
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
        <Link href="/" className="self-start font-display text-xl font-bold tracking-tight">
          Aspire <span className="text-brand-strong">Portal</span>
        </Link>
        {children}
      </main>
    </div>
  );
}
