import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
const [email, role] = z
  .tuple([z.email(), z.enum(["ADMIN", "SUPER_ADMIN"])])
  .parse(process.argv.slice(2));
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user?.emailVerified)
    throw new Error(
      "An existing verified user is required. No default administrator is created.",
    );
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { role } }),
    db.auditLog.create({
      data: {
        userId: user.id,
        action: `ADMIN_ROLE_GRANTED_${role}`,
        resourceId: user.id,
      },
    }),
  ]);
  console.log(
    "Administrative role granted to the verified account. This does not grant premium membership.",
  );
} finally {
  await db.$disconnect();
}
