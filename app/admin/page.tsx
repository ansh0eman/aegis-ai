import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/authorization";
import AdminUsersClient, { type AdminUser } from "./users-client";

export default async function AdminPage() {
  const access = await requireAdmin();
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");

  if (!access.ok) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-slate-950">Forbidden</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account does not have permission to view this page.
        </p>
      </main>
    );
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
    .orderBy(users.id)
    .all()
    .map((user) => ({ ...user, createdAt: user.createdAt.toISOString() }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-slate-950">Admin · Users</h1>
      <p className="mt-2 text-sm text-slate-600">
        Signed in as {access.user.email}
      </p>
      <AdminUsersClient users={safeUsers} currentUserId={access.user.id} />
    </main>
  );
}
