import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Pass `datasources` only when there is actually a URL to pass.
 *
 * This used to hand Prisma `{ db: { url: process.env.DATABASE_URL } }`
 * unconditionally. With `strictUndefinedChecks` enabled, an undefined url is
 * now a constructor error rather than something Prisma quietly ignores — which
 * is the point of the flag, but it means the override has to be conditional.
 * Without a URL we let Prisma read `env("DATABASE_URL")` from the schema, which
 * is the same source and gives the same result.
 */
const datasourceUrl = process.env.DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
