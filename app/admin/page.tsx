import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/authorization";

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

  const safeUsers = db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.id)
    .all();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-slate-950">Admin · Users</h1>
      <p className="mt-2 text-sm text-slate-600">
        Signed in as {access.user.email}
      </p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">ID</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {safeUsers.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3">{user.id}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3">
                  <time dateTime={user.createdAt.toISOString()}>
                    {user.createdAt.toLocaleString()}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
