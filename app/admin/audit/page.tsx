import Link from "next/link";
import { redirect } from "next/navigation";
import { getRecentAuditLogs } from "@/lib/audit";
import { requireAdmin } from "@/lib/authorization";

export default async function AdminAuditPage() {
  const access = await requireAdmin();
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");

  if (!access.ok) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-slate-950">Forbidden</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account does not have permission to view this page.
        </p>
      </main>
    );
  }

  const events = getRecentAuditLogs();

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Audit log</h1>
          <p className="mt-2 text-sm text-slate-600">
            Recent account provisioning and status changes.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          Back to users
        </Link>
      </header>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">Actor</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.map((event) => (
              <tr key={event.id}>
                <td className="px-4 py-3">
                  <time dateTime={event.createdAt.toISOString()}>
                    {event.createdAt.toLocaleString()}
                  </time>
                </td>
                <td className="px-4 py-3">
                  {event.actor.email} (#{event.actor.id})
                </td>
                <td className="px-4 py-3 font-mono text-xs">{event.action}</td>
                <td className="px-4 py-3">
                  {event.target
                    ? `${event.target.email} (#${event.target.id})`
                    : "—"}
                </td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No audit events yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
