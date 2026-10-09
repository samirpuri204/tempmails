import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const path = ".env.production.bootstrap";
if (!existsSync(path)) {
  const values = {
    APP_URL: "https://tempmails.live",
    NEXT_PUBLIC_APP_URL: "https://tempmails.live",
    EMAIL_DOMAIN: "tempmails.live",
    TRUST_PROXY: "true",
    APP_SECRET: randomBytes(32).toString("hex"),
    INBOUND_SECRET: randomBytes(32).toString("hex"),
    CRON_SECRET: randomBytes(32).toString("hex"),
  };
  writeFileSync(
    path,
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
}
for (const line of readFileSync(path, "utf8").trim().split("\n")) {
  const index = line.indexOf("="),
    key = line.slice(0, index),
    value = line.slice(index + 1);
  const r = spawnSync(
    "npm",
    [
      "exec",
      "--yes",
      "--package=vercel",
      "--",
      "vercel",
      "env",
      "add",
      key,
      "production",
      "--yes",
      ...(key.endsWith("SECRET") ? ["--sensitive"] : ["--no-sensitive"]),
    ],
    { input: value, encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(
      `Could not configure ${key}. Inspect Vercel environment names and avoid rotating existing secrets.`,
    );
    process.exit(1);
  }
  console.log(`Configured ${key}`);
}
