import argon2 from "argon2";
import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { basename, resolve } from "node:path";

const databasePath = requireIsolatedDemoDatabase();
const identities = getIdentities();
const database = new Database(databasePath);
database.pragma("foreign_keys = ON");

try {
  const existing = database.prepare("SELECT email, role FROM users ORDER BY id").all();
  const allowedEmails = new Set(identities.map((identity) => identity.email));
  if (existing.some((user) => !allowedEmails.has(user.email)) || existing.length > 3) {
    throw new Error("Refusing to seed: the isolated database contains an unexpected user.");
  }

  const existingEmails = new Set(existing.map((user) => user.email));
  const credentials = [];
  const prepared = await Promise.all(identities.map(async (identity) => {
    if (existingEmails.has(identity.email)) return { ...identity, password: null, passwordHash: null };
    const password = randomBytes(24).toString("base64url");
    return { ...identity, password, passwordHash: await argon2.hash(password, { type: argon2.argon2id }) };
  }));
  const provisioned = database.transaction(() => {
    const inserted = [];
    for (const identity of prepared) {
      const existingUser = database.prepare("SELECT id FROM users WHERE email = ?").get(identity.email);
      let userId;
      if (existingUser) {
        userId = existingUser.id;
        database.prepare("UPDATE users SET role = ?, status = 'active' WHERE id = ?")
          .run(identity.role, userId);
      } else {
        const result = database.prepare(
          "INSERT INTO users (email, password_hash, role, status, created_at) VALUES (?, ?, ?, 'active', ?)",
        ).run(identity.email, identity.passwordHash, identity.role, Date.now());
        userId = Number(result.lastInsertRowid);
        credentials.push({ label: identity.label, email: identity.email, password: identity.password });
        inserted.push({ email: identity.email, id: userId });
      }
      database.prepare(`
        INSERT INTO ai_policies (user_id, ai_enabled, max_prompt_chars, max_requests_per_day, created_at, updated_at)
        VALUES (?, 0, 1200, 20, ?, ?)
        ON CONFLICT(user_id) DO NOTHING
      `).run(userId, Date.now(), Date.now());
      const conversation = database.prepare("SELECT 1 FROM conversations WHERE user_id = ? LIMIT 1").get(userId);
      if (!conversation) seedSampleConversation(database, userId, identity.role);
    }

    const [admin] = database.prepare("SELECT id FROM users WHERE email = ?").all(identities[0].email);
    if (!admin) throw new Error("The designated demo admin could not be created.");
    for (const user of inserted) {
      database.prepare(
        "INSERT INTO audit_logs (actor_user_id, target_user_id, action, metadata, created_at) VALUES (?, ?, 'user.provisioned', ?, ?)",
      ).run(admin.id, user.id, JSON.stringify({ email: user.email, source: "operator_demo_setup" }), Date.now());
    }
  });
  provisioned();

  console.log("Public demo accounts are ready in the isolated database.");
  if (credentials.length) {
    console.log("Capture the newly generated credentials now in a secure operator workflow; they are not saved by this script.");
    for (const credential of credentials) {
      console.log(`${credential.label}\n  email: ${credential.email}\n  password: ${credential.password}`);
    }
  } else {
    console.log("Existing credentials were preserved; no passwords were printed or changed.");
  }
  console.log("All three accounts are active, default AI policies are disabled, and only the designated demo admin has the admin role.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Public demo setup failed.");
  process.exitCode = 1;
} finally {
  database.close();
}

function requireIsolatedDemoDatabase() {
  if (process.env.AEGIS_PUBLIC_DEMO_DATABASE !== "true") {
    throw new Error("Set AEGIS_PUBLIC_DEMO_DATABASE=true only for the dedicated public-demo deployment.");
  }
  if (!process.env.AEGIS_DATABASE_PATH || basename(process.env.AEGIS_DATABASE_PATH) !== "aegis-public-demo.db") {
    throw new Error("AEGIS_DATABASE_PATH must explicitly end in aegis-public-demo.db.");
  }
  return resolve(process.cwd(), process.env.AEGIS_DATABASE_PATH);
}

function getIdentities() {
  const rows = [
    ["demo-admin", process.env.PUBLIC_DEMO_ADMIN_EMAIL, "admin"],
    ["demo-user1", process.env.PUBLIC_DEMO_USER1_EMAIL, "member"],
    ["demo-user2", process.env.PUBLIC_DEMO_USER2_EMAIL, "member"],
  ];
  if (rows.some(([, email]) => !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) {
    throw new Error("Set three valid PUBLIC_DEMO_*_EMAIL values before setup.");
  }
  const emails = rows.map(([, email]) => email.trim().toLowerCase());
  if (new Set(emails).size !== 3) throw new Error("The three demo email addresses must be distinct.");
  return rows.map(([label, , role], index) => ({ label, email: emails[index], role }));
}

function seedSampleConversation(database, userId, role) {
  const now = Date.now();
  const result = database.prepare("INSERT INTO conversations (user_id, created_at) VALUES (?, ?)").run(userId, now);
  const answer = role === "admin"
    ? "Seeded sample answer (not generated by AI): Admin-only routes check the signed-in user's role on the server. Member accounts can use their own conversations but cannot access user management or audit controls."
    : "Seeded sample answer (not generated by AI): Your conversation belongs to your account. The server checks ownership before loading or continuing it, while admin controls are restricted to the designated demo admin.";
  const insert = database.prepare("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)");
  insert.run(Number(result.lastInsertRowid), "user", "Seeded sample: How does role-based access control work in this workspace?", now);
  insert.run(Number(result.lastInsertRowid), "assistant", answer, now + 1);
}
