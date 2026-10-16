import { redirect } from "next/navigation";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/authorization";
import AdminUsersClient, { type AdminUser } from "./users-client";
import { getPublicDemoConfig, isPublicDemoEnvironment } from "@/lib/public-demo";

export default async function AdminPage() {
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

  const demoConfig = getPublicDemoConfig();
  if (isPublicDemoEnvironment() && !demoConfig) {
    return <main className="container app-main"><h1>Public demo administration unavailable</h1><p>Contact the operator to fix the demo account configuration.</p></main>;
  }

  const safeUsers: AdminUser[] = db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(demoConfig ? inArray(users.email, demoConfig.emails) : undefined)
    .orderBy(users.id)
    .all()
    .map((user) => ({ ...user, createdAt: user.createdAt.toISOString() }));

  return (
    <>
      <header className="site-header"><div className="container nav-row"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">A</span><span>Aegis AI</span></Link><nav aria-label="Admin navigation" className="nav-links"><Link href="/chat">Workspace</Link><Link href="/admin/audit">Audit log</Link></nav></div></header>
      <main className="container app-main">
        {isPublicDemoEnvironment() ? <p className="status-message warning mb-5">Shared demonstration environment. Other visitors may view messages saved in these accounts. Do not enter personal, confidential, or sensitive information.</p> : null}
        <div className="page-heading"><div><span className="badge badge-accent">Admin console</span><h1 className="mt-4">Users and access</h1><p>Signed in as {access.user.email}. Manage members and their AI access.</p></div></div>
        <AdminUsersClient users={safeUsers} currentUserId={access.user.id} restrictProvisioning={isPublicDemoEnvironment()} />
      </main>
    </>
  );
}
