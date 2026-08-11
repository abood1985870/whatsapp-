import { z } from "zod";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

let envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  envPath = path.resolve(process.cwd(), "../../.env");
}
dotenv.config({ path: envPath });

/**
 * Booleans from environment variables.
 *
 * `z.coerce.boolean()` is JavaScript truthiness: every non-empty string becomes
 * true. So REDIS_DISABLED="false" was TRUE, and so was "no", "0" and "off".
 * Someone writing the obvious thing to keep a feature OFF turned it on — and
 * for REDIS_DISABLED specifically that silently removed the AI rate limit.
 */
export function parseEnvBoolean(value: boolean | string): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  throw new Error(`Expected a boolean like "true" or "false", received "${value}"`);
}

const envBoolean = (defaultValue: boolean) =>
  z.union([z.boolean(), z.string()]).default(defaultValue).transform(parseEnvBoolean);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_NAME: z.string().default("QanoAI WhatsAppSupport"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:3001"),
  REALTIME_URL: z.string().url().default("http://localhost:3002"),
  CORS_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_DISABLED: envBoolean(false),
  // SUPABASE_* removed. Four variables described an object-storage and auth
  // integration that no code ever read, so the configuration surface implied a
  // capability the product does not have. Postgres is reached through
  // DATABASE_URL; there is no Supabase client anywhere.
  AUTH_SECRET: z.string().min(32),
  AUTH_ENCRYPTION_KEY: z.string().min(32),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(32),
  EMAIL_FROM: z.string().email().default("noreply@qanoai.com"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_WEBHOOK_BASE_URL: z.string().url().optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET_PRIVATE: z.string().default("qanoai-private"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  AI_DEFAULT_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  AI_DEFAULT_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().default(30000),
  QUEUE_PREFIX: z.string().default("qanoai"),
  REALTIME_PORT: z.coerce.number().default(3002),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(50),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SENTRY_DSN: z.string().optional(),
  FEATURE_BILLING_ENABLED: envBoolean(false),
  FEATURE_N8N_ENABLED: envBoolean(false),
  N8N_WEBHOOK_BASE_URL: z.string().optional(),
  PLATFORM_OWNER_EMAIL: z.string().email().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  // AI Voice Employee. Absent values keep the module in Simulation mode;
  // nothing here is ever defaulted to a fake credential.
  VOICE_PROVIDER: z.enum(["SIMULATION", "TWILIO"]).default("SIMULATION"),
  VOICE_PUBLIC_BASE_URL: z.string().url().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  VOICE_REALTIME_MODEL: z.string().default("gpt-realtime"),
  VOICE_REALTIME_URL: z.string().default("wss://api.openai.com/v1/realtime"),
  VOICE_STREAM_TOKEN_SECRET: z.string().optional(),
  VOICE_TELEPHONY_COST_PER_MINUTE_MINOR: z.coerce.number().default(0),
  VOICE_AI_COST_PER_MINUTE_MINOR: z.coerce.number().default(0),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const config = parsed.data;
export type Config = z.infer<typeof envSchema>;

export function getAllowedOrigins(): string[] | true {
  if (config.CORS_ORIGINS) {
    return config.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
  }

  return config.NODE_ENV === "production" ? [config.APP_URL] : true;
}
