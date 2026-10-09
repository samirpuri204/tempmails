import { db } from "../lib/db";
import { passwordHash } from "../lib/security";
import { z } from "zod";
async function main() {
  const email = z.email().parse(process.env.OWNER_EMAIL).toLowerCase();
  const password = z
    .string()
    .min(14)
    .max(256)
    .parse(process.env.OWNER_PASSWORD);
  if (await db.adminUser.count({ where: { role: "OWNER" } }))
    throw new Error(
      "An owner already exists. Use the authenticated admin panel.",
    );
  await db.adminUser.create({
    data: { email, passwordHash: passwordHash(password), role: "OWNER" },
  });
  console.log("Owner created. Remove OWNER_PASSWORD from the environment.");
}
main().finally(() => db.$disconnect());
