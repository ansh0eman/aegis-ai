import AuthForm from "@/app/auth/auth-form";
import Link from "next/link";
import SiteHeader from "@/app/ui/site-header";
import { isPublicRegistrationOpen } from "@/lib/request-security";

export default function RegisterPage() {
  if (!isPublicRegistrationOpen()) {
    return (
      <>
        <SiteHeader page="auth" />
        <main className="container grid min-h-[calc(100dvh-72px)] place-items-center py-12">
          <section className="panel max-w-lg p-8">
            <span className="badge badge-accent">Private workspace</span>
            <h1 className="mt-5 text-2xl font-semibold">Registration is closed</h1>
            <p className="mt-3 text-sm leading-6 muted">An administrator provisions accounts for this workspace. If you already have one, sign in. You can also explore the public simulation without an account.</p>
            <div className="mt-6 flex flex-wrap gap-3"><Link href="/login" className="button button-primary">Sign in</Link><Link href="/demo" className="button button-secondary">Explore demo</Link></div>
          </section>
        </main>
      </>
    );
  }
  return <AuthForm mode="register" />;
}
