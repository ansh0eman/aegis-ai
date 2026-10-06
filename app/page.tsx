import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white px-8 py-12 shadow-sm sm:px-12 sm:py-16">
        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
          Development
        </span>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Aegis AI
        </h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          Enterprise AI Workspace
        </p>

        <Link
          href="/chat"
          className="mt-10 inline-flex h-11 items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Open Workspace
        </Link>
        <div className="mt-6 flex gap-5 text-sm font-medium text-slate-600">
          <Link href="/login" className="hover:text-slate-950">Log in</Link>
          <Link href="/register" className="hover:text-slate-950">Create account</Link>
        </div>
      </section>
    </main>
  );
}
