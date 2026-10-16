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
      <section className="panel p-5 sm:p-6">
        <h2 className="section-title">Provision members</h2>
        <p className="mt-1 text-sm muted">Enter one email and temporary password per line, separated by a comma. New accounts start as active members.</p>
        <form onSubmit={provisionUsers} className="mt-5">
          <label htmlFor="provision-users" className="field-label">Users to provision</label>
          <textarea id="provision-users" value={rows} onChange={(event) => setRows(event.target.value)} placeholder={"member@example.com,TemporaryPassword123"} rows={3} className="input min-h-28 resize-y font-mono" />
          <button type="submit" disabled={isProvisioning} className="button button-primary mt-3">{isProvisioning ? "Provisioning..." : "Provision users"}</button>
        </form>
        {error ? <p role="alert" className="status-message error mt-4">{error}</p> : null}
        {provisionResult ? (
          <div role="status" className="status-message mt-4 space-y-2">
            <p>Created {provisionResult.created.length} user(s).</p>
            {provisionResult.created.length > 0 ? <ul className="list-inside list-disc">{provisionResult.created.map((user) => <li key={user.id}>{user.email}: {user.role}, {user.status}</li>)}</ul> : null}
            {provisionResult.failed.length > 0 ? <div><p className="font-semibold error-text">Not created:</p><ul className="list-inside list-disc">{provisionResult.failed.map((failure, index) => <li key={`${failure.email}-${index}`}>{failure.email}: {failure.reason}</li>)}</ul></div> : null}
          </div>
        ) : null}
      </section>

      <section className="mt-8" aria-labelledby="members-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><h2 id="members-title" className="section-title">Members</h2><p className="text-sm muted">{users.length} account{users.length === 1 ? "" : "s"}</p></div>
        <div className="table-wrap">
          <table className="data-table min-w-[780px]">
            <thead><tr><th scope="col">ID</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <Fragment key={user.id}>
                  <tr>
                    <td className="font-mono text-xs muted">{user.id}</td>
                    <td className="font-medium">{user.email}{user.id === currentUserId ? <span className="ml-2 text-xs muted">(you)</span> : null}</td>
                    <td>{user.role}</td>
                    <td><span className={`badge ${user.status === "active" ? "badge-success" : "badge-danger"}`}>{user.status}</span></td>
                    <td><time dateTime={user.createdAt}>{new Date(user.createdAt).toLocaleString()}</time></td>
                    <td className="whitespace-nowrap">
                      <button type="button" onClick={() => void updateStatus(user)} disabled={pendingId === user.id || (user.id === currentUserId && user.status === "active")} className="text-link disabled:opacity-50">{pendingId === user.id ? "Saving..." : user.status === "active" ? "Disable" : "Enable"}</button>
                      <button type="button" onClick={() => setPolicyUserId((current) => current === user.id ? null : user.id)} aria-expanded={policyUserId === user.id} className="text-link ml-4">{policyUserId === user.id ? "Close policy" : "AI policy"}</button>
                    </td>
                  </tr>
                  {policyUserId === user.id ? <tr><td colSpan={6} className="bg-[#11171d]"><AiPolicyEditor userId={user.id} email={user.email} /></td></tr> : null}
                </Fragment>
              ))}
              {users.length === 0 ? <tr><td colSpan={6} className="text-center muted">No users yet. Provision a member above.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
