"use client";

import { Fragment, useState, type FormEvent } from "react";
import type { UserRole, UserStatus } from "@/db/schema";
import AiPolicyEditor from "./ai-policy-editor";

export type AdminUser = {
  id: number;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
};

type ProvisionResult = {
  created: AdminUser[];
  failed: Array<{ email: string; reason: string }>;
};

export default function AdminUsersClient({
  users: initialUsers,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: number;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [rows, setRows] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [provisionResult, setProvisionResult] =
    useState<ProvisionResult | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [policyUserId, setPolicyUserId] = useState<number | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);

  async function updateStatus(user: AdminUser) {
    const status = user.status === "active" ? "disabled" : "active";
    setError(null);
    setPendingId(user.id);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json()) as {
        user?: AdminUser;
        error?: unknown;
      };
      if (!response.ok || !result.user) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "The user status could not be changed.",
        );
      }
      setUsers((current) =>
        current.map((item) =>
          item.id === result.user?.id ? result.user : item,
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The user status could not be changed.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function provisionUsers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setProvisionResult(null);

    const parsed: Array<{ email: string; password: string }> = [];
    for (const [index, line] of rows.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      const comma = line.indexOf(",");
      if (comma < 1 || comma === line.length - 1) {
        setError(`Line ${index + 1} must use email,password format.`);
        return;
      }
      parsed.push({
        email: line.slice(0, comma).trim(),
        password: line.slice(comma + 1).trim(),
      });
    }
    if (parsed.length === 0) {
      setError("Enter at least one email,password row.");
      return;
    }

    setIsProvisioning(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: parsed }),
      });
      const result = (await response.json()) as
        | ProvisionResult
        | { error?: unknown };
      if (!response.ok || !("created" in result) || !("failed" in result)) {
        throw new Error(
          "error" in result && typeof result.error === "string"
            ? result.error
            : "The users could not be provisioned.",
        );
      }

      setProvisionResult(result);
      setUsers((current) => {
        const existingIds = new Set(current.map((user) => user.id));
        return [...current, ...result.created.filter((user) => !existingIds.has(user.id))]
          .sort((a, b) => a.id - b.id);
      });
      setRows("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The users could not be provisioned.",
      );
    } finally {
      setIsProvisioning(false);
    }
  }

  return (
    <>
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Provision users</h2>
        <p className="mt-1 text-sm text-slate-600">
          Enter one email and temporary password per line, separated by a comma.
        </p>
        <form onSubmit={provisionUsers} className="mt-4 space-y-3">
          <label htmlFor="provision-users" className="sr-only">
            Users to provision
          </label>
          <textarea
            id="provision-users"
            value={rows}
            onChange={(event) => setRows(event.target.value)}
            placeholder={"alice@example.com,TemporaryPassword123\nbob@example.com,TemporaryPassword456"}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={isProvisioning}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isProvisioning ? "Provisioning…" : "Provision users"}
          </button>
        </form>
        {error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        {provisionResult ? (
          <div className="mt-4 space-y-3 text-sm">
            <p>Created {provisionResult.created.length} user(s).</p>
            {provisionResult.created.length > 0 ? (
              <ul className="list-inside list-disc text-slate-700">
                {provisionResult.created.map((user) => (
                  <li key={user.id}>{user.email} — {user.role}, {user.status}</li>
                ))}
              </ul>
            ) : null}
            {provisionResult.failed.length > 0 ? (
              <div>
                <p className="font-medium text-amber-800">Not created:</p>
                <ul className="list-inside list-disc text-amber-800">
                  {provisionResult.failed.map((failure, index) => (
                    <li key={`${failure.email}-${index}`}>
                      {failure.email} — {failure.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">ID</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <Fragment key={user.id}>
                <tr>
                  <td className="px-4 py-3">{user.id}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{user.role}</td>
                  <td className="px-4 py-3">{user.status}</td>
                  <td className="px-4 py-3">
                    <time dateTime={user.createdAt}>
                      {new Date(user.createdAt).toLocaleString()}
                    </time>
                  </td>
                  <td className="space-x-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void updateStatus(user)}
                      disabled={
                        pendingId === user.id ||
                        (user.id === currentUserId && user.status === "active")
                      }
                      className="font-semibold text-blue-700 hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendingId === user.id
                        ? "Saving…"
                        : user.status === "active"
                          ? "Disable"
                          : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPolicyUserId((current) =>
                          current === user.id ? null : user.id,
                        )
                      }
                      className="font-semibold text-slate-700 hover:text-slate-950"
                    >
                      {policyUserId === user.id ? "Close policy" : "AI policy"}
                    </button>
                  </td>
                </tr>
                {policyUserId === user.id ? (
                  <tr>
                    <td colSpan={6} className="bg-slate-50 px-4 py-4">
                      <AiPolicyEditor userId={user.id} email={user.email} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
