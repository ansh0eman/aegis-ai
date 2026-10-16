import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/app/ui/site-header";

const features = [
  { title: "SSE streaming and cancellation", body: "Server-sent events deliver response chunks; Stop aborts generation and keeps incomplete text unsaved." },
  { title: "JWT sessions and RBAC", body: "HttpOnly JWT cookies identify users; server-side role checks protect admin routes and APIs." },
  { title: "Conversations that persist", body: "SQLite and Drizzle store owned conversations; transactions protect account changes." },
  { title: "Usage with guardrails", body: "Per-user AI policies set prompt and daily request limits before a model call." },
  { title: "An accountable admin trail", body: "Provisioning and status changes write append-only audit events with their business mutations." },
];

export default function Home() {
  return (
    <>
      <SiteHeader page="home" />
      <main>
        <section className="container hero" aria-labelledby="home-title">
          <div>
            <p className="eyebrow">Enterprise AI workspace</p>
            <h1 id="home-title" className="mt-5">Enterprise AI, under control.</h1>
            <p className="hero-copy">A reference application for streaming conversations, governed access, and the operational details behind enterprise AI.</p>
            <div className="hero-actions">
              <Link href="/demo" className="button button-primary">Explore Interactive Demo</Link>
              <a href="https://github.com/ansh0eman/aegis-ai" target="_blank" rel="noopener noreferrer" className="button button-secondary">View Source on GitHub</a>
            </div>
          </div>
          <div className="hero-preview">
            <Image src="/hero-infrastructure.jpg" alt="Abstract close-up of charcoal metal panels with a restrained blue edge light" width={1536} height={1024} priority sizes="(max-width: 800px) 100vw, 54vw" />
          </div>
        </section>

        <section className="section-block" aria-label="Public demo notice">
          <div className="container flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-2xl text-base leading-7">The public demo uses scripted messages and synthetic account data. It does not use a live AI model or your private workspace.</p>
            <span className="badge badge-accent">Simulated demo</span>
          </div>
        </section>

        <section className="container section-block" aria-labelledby="architecture-title">
          <h2 id="architecture-title" className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Built to show the decisions behind the interface.</h2>
          <div className="feature-grid">
            {features.map((feature) => (
              <article key={feature.title} className="feature-item">
                <div><h3>{feature.title}</h3><p>{feature.body}</p></div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-[var(--line)] py-7">
        <div className="container text-sm muted">
          <span>Aegis AI. An engineering portfolio project.</span>
        </div>
      </footer>
    </>
  );
}
