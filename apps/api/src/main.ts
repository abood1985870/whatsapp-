import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import compression from "compression";

import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { CorrelationInterceptor } from "./common/interceptors/correlation.interceptor";
import { config, getAllowedOrigins } from "@qanoai/config";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // The API only ever receives traffic through gateway.js on the same host, so
  // req.ip was always 127.0.0.1 and the rate limiter below treated every caller
  // on the internet as one client. Trusting exactly one hop — no more — makes
  // req.ip the real client address without letting a caller spoof it by
  // sending their own X-Forwarded-For.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(compression());

  // Rate Limiting
  const rateLimit = require("express-rate-limit");
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // limit each IP to 1000 requests per windowMs
    })
  );

  // Request size limits.
  //
  // 50mb is far larger than any legitimate JSON body from the frontend, and an
  // oversized body is parsed before any guard runs. It is NOT reduced here on
  // purpose: Evolution can be configured to deliver inbound WhatsApp media as
  // base64 inside the webhook payload, and lowering this without first
  // confirming that setting on the deployed instance would silently drop
  // inbound media messages. Reduce it once that is verified — see G-2 in
  // docs/review/TIER1_FINDINGS.md.
  const bodyParser = require("body-parser");
  app.use(bodyParser.json({ limit: "50mb" }));
  app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new CorrelationInterceptor(), new TransformInterceptor());

  if (process.env.NODE_ENV !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("QanoAI WhatsAppSupport API")
      .setDescription("AI-powered WhatsApp customer support platform API")
      .setVersion("1.0.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  // Enable Graceful Shutdowns for Production (close DB connections safely)
  app.enableShutdownHooks();

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
