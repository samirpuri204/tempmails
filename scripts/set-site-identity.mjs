// Set the public identity fields in WebsiteSetting "site".
//
// One script for the two values that must agree across the wordmark, the
// footer, the metadata, the structured data and the policies:
//
//   --name           the operating name (settings.name → Organization.name,
//                    the header wordmark, the footer, og:site_name)
//   --contact-email  the business mailbox shown on /contact and used as the
//                    contact form's destination
//
// Both are stored settings rather than code, so publishing them is a database
// write. The guards are the reason this exists instead of a note telling the
// operator to click around:
//
//   - read-only by default (dry run), so it is safe to inspect;
//   - refuses to target anything other than the canonical origin;
//   - validates against the same limits the application's schema enforces, so
//     this cannot write a value the admin console would reject;
//   - writes a mode-0600 backup before changing the row, and never creates the
//     row (a missing settings row is an error, not something to invent);
//   - changes only the keys named on the command line, then re-reads and
//     verifies that every other key is byte-for-byte identical.
//
// Run with the operator's environment already loaded:
//   node --env-file=.env.production.local scripts/set-site-identity.mjs --name=TempMails
//   node --env-file=.env.production.local scripts/set-site-identity.mjs \
//     --name=TempMails --contact-email=founder@tempmails.live \
//     --expect-origin=https://tempmails.live --apply
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const CANONICAL = "https://tempmails.live";
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
// Mirrors lib/settings.ts: name is 1–50 characters, contactEmail is an address
// or empty.
const NAME_MIN = 1;
const NAME_MAX = 50;

const args = process.argv.slice(2);
const value = (flag) =>
  args.find((a) => a.startsWith(`--${flag}=`))?.slice(flag.length + 3);
const apply = args.includes("--apply");
const expectOrigin = value("expect-origin");
const name = value("name");
const contactEmail = value("contact-email");

const root = process.cwd();
const fingerprint = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const db = new PrismaClient();

async function main() {
  // Parsed defensively: an unset or malformed APP_URL must produce the same
  // "refusing to target an unverified site" message as a wrong one.
  let origin = "";
  try {
    origin = new URL(process.env.APP_URL || "").origin;
  } catch {
    origin = "";
  }
  if (origin !== CANONICAL) {
    throw new Error(
      `Unexpected APP_URL (${origin || "unset"}); refusing to target an unverified site. Load the operator environment first.`,
    );
  }

  const changes = {};
  if (name !== undefined) {
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      throw new Error(`--name must be ${NAME_MIN}–${NAME_MAX} characters (got ${name.length}).`);
    }
    changes.name = name;
  }
  if (contactEmail !== undefined) {
    if (contactEmail !== "" && !EMAIL.test(contactEmail)) {
      throw new Error("--contact-email must be a plain email address, or empty to unset it.");
    }
    changes.contactEmail = contactEmail;
  }
  if (!Object.keys(changes).length) {
    throw new Error("Nothing to do: pass --name=<name> and/or --contact-email=<address>.");
  }
  if (apply && expectOrigin !== origin) {
    throw new Error("--expect-origin must equal APP_URL when applying.");
  }

  const dbUrl = new URL(process.env.DATABASE_URL || "");
  const databaseFingerprint = fingerprint(`${dbUrl.hostname}${dbUrl.pathname}`);

  const row = await db.websiteSetting.findUnique({ where: { key: "site" } });
  if (!row) throw new Error("Missing site settings; refusing to create or reset them.");
  const current = { ...row.value };

  const before = {};
  const after = {};
  for (const key of Object.keys(changes)) {
    before[key] = current[key] ?? "";
    after[key] = changes[key];
  }

  console.log(
    JSON.stringify(
      {
        origin,
        databaseFingerprint,
        mode: apply ? "apply" : "dry-run",
        changes: Object.fromEntries(
          Object.keys(changes).map((k) => [k, { before: before[k], after: after[k] }]),
        ),
        untouchedKeys: Object.keys(current).filter((k) => !(k in changes)).sort(),
        backup: apply ? "written before the update" : "not needed for a dry run",
      },
      null,
      2,
    ),
  );
  if (!apply) return;

  if (Object.keys(changes).every((k) => current[k] === changes[k])) {
    console.log("Already set to those values; nothing to do.");
    return;
  }

  const dir = resolve(root, ".private-content-backups");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const backup = resolve(dir, `site-identity-${Date.now()}.json`);
  await writeFile(
    backup,
    JSON.stringify(
      {
        version: 1,
        capturedAt: new Date().toISOString(),
        origin,
        databaseFingerprint,
        setting: "site",
        before: current,
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  console.log(`Private backup created: ${backup}`);

  await db.websiteSetting.update({
    where: { key: "site" },
    data: { value: { ...current, ...changes } },
  });

  // Re-read and compare. A "successful" write that silently dropped the other
  // settings would be worse than a failure, because nothing would report it.
  const stored = (await db.websiteSetting.findUniqueOrThrow({ where: { key: "site" } })).value;
  for (const [key, expected] of Object.entries(changes)) {
    if (stored[key] !== expected) {
      throw new Error(`Post-write verification failed: ${key} is "${stored[key]}", expected "${expected}".`);
    }
  }
  const beforeKeys = Object.keys(current).sort().join(",");
  const afterKeys = Object.keys(stored).sort().join(",");
  if (beforeKeys !== afterKeys) throw new Error("Post-write verification failed: setting keys changed.");
  for (const key of Object.keys(current)) {
    if (key in changes) continue;
    if (JSON.stringify(stored[key]) !== JSON.stringify(current[key])) {
      throw new Error(`Post-write verification failed: ${key} was modified.`);
    }
  }

  console.log(
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        applied: Object.fromEntries(Object.keys(changes).map((k) => [k, { before: before[k], after: stored[k] }])),
        unrelatedSettingsPreserved: true,
        backup,
        nextStep: "Redeploy, or wait for the page cache to turn over, then re-check the homepage and /company.",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error
        ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]")
        : "Site identity update failed",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
