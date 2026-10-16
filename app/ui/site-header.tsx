import Link from "next/link";

export default function SiteHeader({ page }: { page: "home" | "demo" | "auth" }) {
  return (
    <header className="site-header">
      <div className="container nav-row">
        <Link href="/" className="brand" aria-label="Aegis AI home">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>Aegis AI</span>
        </Link>
        <nav aria-label="Main navigation" className="nav-links">
          {page !== "home" ? <Link href="/">Overview</Link> : null}
          {page === "auth" ? <Link href="/demo">Demo</Link> : null}
          {page !== "auth" ? <Link href="/login">Sign in</Link> : null}
        </nav>
      </div>
    </header>
  );
}
