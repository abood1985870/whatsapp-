import { z } from "zod";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

let envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  envPath = path.resolve(process.cwd(), "../../.env");
}
dotenv.config({ path: envPath });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_NAME: z.string().default("QanoAI WhatsAppSupport"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:3001"),
  REALTIME_URL: z.string().url().default("http://localhost:3002"),
  CORS_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_DISABLED: z.coerce.boolean().default(false),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_JWKS_URL: z.string().url().optional(),
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
  FEATURE_BILLING_ENABLED: z.coerce.boolean().default(false),
  FEATURE_N8N_ENABLED: z.coerce.boolean().default(false),
  N8N_WEBHOOK_BASE_URL: z.string().optional(),
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
