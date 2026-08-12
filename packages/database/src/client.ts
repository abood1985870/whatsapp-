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

/**
 * Message usage is metered here, once, instead of at each of the six call
 * sites that create a Message (whatsapp.service, webhooks.service,
 * messages.service, sales-conversation.service, marketing-send.service,
 * ai-response.processor) — a single choke point nothing can bypass, so
 * subscription usage tracking cannot silently miss a new send path.
 *
 * `idempotencyKey: msg:<message.id>` makes the UsageEvent write safe against
 * webhook retries and duplicate processing: the unique constraint on
 * UsageEvent.idempotencyKey turns a re-delivery into a no-op instead of a
 * double count. Recording failure never fails the message write — usage
 * metering is best-effort and must not block the product it is metering.
 */
prisma.$use(async (params, next) => {
  const result = await next(params);
  if (params.model === "Message" && params.action === "create" && result?.id) {
    prisma.usageEvent
      .create({
        data: {
          organizationId: result.organizationId,
          featureKey: "whatsapp.messages",
          quantity: 1,
          idempotencyKey: `msg:${result.id}`,
          metadata: { direction: result.direction, messageType: result.messageType },
        },
      })
      .catch(() => {});
  }
  return result;
});
