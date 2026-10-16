import Link from "next/link";
import { redirect } from "next/navigation";
import { getRecentAuditLogs } from "@/lib/audit";
import { requireAdmin } from "@/lib/authorization";

export default async function AdminAuditPage() {
  const access = await requireAdmin();
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");

  if (!access.ok) {
    return (
      <main className="container app-main">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm muted">
          Your account does not have permission to view this page.
        </p>
        <Link href="/chat" className="text-link mt-5 inline-block text-sm">Return to workspace</Link>
      </main>
    );
  }

  const events = getRecentAuditLogs();

  return (
    <>
      <header className="site-header"><div className="container nav-row"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">A</span><span>Aegis AI</span></Link><nav aria-label="Admin navigation" className="nav-links"><Link href="/chat">Workspace</Link><Link href="/admin">Users</Link></nav></div></header>
      <main className="container app-main">
        <div className="page-heading"><div><span className="badge badge-accent">Admin console</span><h1 className="mt-4">Audit log</h1><p>Recent account provisioning and status changes.</p></div><Link href="/admin" className="button button-secondary">Back to users</Link></div>
        <div className="table-wrap">
        <table className="data-table min-w-[680px]">
          <thead>
            <tr>
              <th scope="col">Time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Target</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>
                  <time dateTime={event.createdAt.toISOString()}>
                    {event.createdAt.toLocaleString()}
                  </time>
                </td>
                <td>
                  {event.actor.email} (#{event.actor.id})
                </td>
                <td className="font-mono text-xs text-[var(--accent)]">{event.action}</td>
                <td>
                  {event.target
                    ? `${event.target.email} (#${event.target.id})`
                    : "None"}
                </td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center muted">
                  No audit events yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </main>
    </>
  );
}
