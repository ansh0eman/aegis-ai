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
            <svg
              viewBox="0 0 760 520"
              role="img"
              aria-labelledby="architecture-art-title architecture-art-description"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title id="architecture-art-title">Aegis AI request flow</title>
              <desc id="architecture-art-description">
                An original vector illustration linking a browser, a policy gate, and a model through a restrained blue data path.
              </desc>
              <rect width="760" height="520" fill="#111820" />
              <path d="M0 110H760M0 410H760M80 0V520M680 0V520" stroke="#1c2834" strokeWidth="1" />
              <circle cx="380" cy="260" r="186" fill="#141e29" stroke="#253648" strokeWidth="1.5" />
              <circle cx="380" cy="260" r="144" fill="none" stroke="#26394d" strokeDasharray="3 10" strokeWidth="1" />
              <path d="M190 260H570" stroke="#385b81" strokeWidth="2" />
              <path d="M190 260H570" stroke="#a8c7ff" strokeWidth="2" strokeDasharray="9 13" />
              <g transform="translate(82 190)">
                <rect width="166" height="140" rx="13" fill="#1b2530" stroke="#50657c" />
                <rect x="18" y="18" width="130" height="12" rx="6" fill="#2d3c4c" />
                <circle cx="27" cy="24" r="3" fill="#a8c7ff" />
                <rect x="18" y="49" width="45" height="73" rx="7" fill="#141d26" stroke="#35495d" />
                <rect x="73" y="49" width="75" height="9" rx="4.5" fill="#5a7087" />
                <rect x="73" y="67" width="61" height="6" rx="3" fill="#394c60" />
                <rect x="73" y="84" width="70" height="28" rx="5" fill="#263a50" />
                <path d="M83 99h24" stroke="#a8c7ff" strokeWidth="2" strokeLinecap="round" />
                <text x="0" y="165" fill="#91a2b5" fontSize="11" fontFamily="ui-sans-serif, system-ui" letterSpacing="2">BROWSER</text>
              </g>
              <g transform="translate(305 177)">
                <rect width="150" height="166" rx="16" fill="#202c38" stroke="#8daed4" strokeWidth="1.5" />
                <path d="M75 28 111 42v31c0 29-18 49-36 60-18-11-36-31-36-60V42l36-14Z" fill="#273a4e" stroke="#a8c7ff" strokeWidth="2" />
                <path d="m59 75 11 11 23-26" fill="none" stroke="#d4e4ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M34 137h82" stroke="#526a83" />
                <circle cx="48" cy="151" r="3" fill="#a8c7ff" />
                <rect x="58" y="148" width="49" height="6" rx="3" fill="#465c72" />
                <text x="14" y="194" fill="#d4dfed" fontSize="11" fontFamily="ui-sans-serif, system-ui" letterSpacing="1.5">POLICY GATE</text>
              </g>
              <g transform="translate(512 190)">
                <rect width="166" height="140" rx="13" fill="#1b2530" stroke="#50657c" />
                <rect x="20" y="24" width="126" height="92" rx="9" fill="#141d26" stroke="#35495d" />
                <circle cx="83" cy="68" r="23" fill="#23384d" stroke="#7899bf" />
                <circle cx="83" cy="68" r="5" fill="#d5e5ff" />
                <path d="M83 38v10m0 40v10M53 68h10m40 0h10M62 47l7 7m28 28 7 7m0-42-7 7m-28 28-7 7" stroke="#a8c7ff" strokeWidth="2" strokeLinecap="round" />
                <rect x="48" y="102" width="70" height="5" rx="2.5" fill="#3d536a" />
                <text x="0" y="165" fill="#91a2b5" fontSize="11" fontFamily="ui-sans-serif, system-ui" letterSpacing="2">MODEL STREAM</text>
              </g>
              <circle cx="190" cy="260" r="5" fill="#c7dcfa" />
              <circle cx="570" cy="260" r="5" fill="#c7dcfa" />
              <text x="301" y="110" fill="#70849a" fontSize="10" fontFamily="ui-sans-serif, system-ui" letterSpacing="2">IDENTITY · POLICY · RESPONSE</text>
              <text x="321" y="450" fill="#627589" fontSize="10" fontFamily="ui-monospace, monospace" letterSpacing="2">AEGIS / CONTROLLED FLOW</text>
            </svg>
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
