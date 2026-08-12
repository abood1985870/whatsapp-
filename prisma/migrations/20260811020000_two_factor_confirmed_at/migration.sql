-- 2FA credentials were written as active the moment the QR was generated, so a
-- user who scanned it and closed the tab was left half-enrolled. A credential
-- is now only usable once the user has proved they can generate a code from it.
--
-- Additive and nullable: existing rows keep working. They are backfilled as
-- confirmed below, because under the old flow the presence of a row on a user
-- with twoFactorEnabled = true meant it was in use.
ALTER TABLE "two_factor_credentials" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);

UPDATE "two_factor_credentials" c
SET "confirmedAt" = c."createdAt"
FROM "users" u
WHERE c."userId" = u."id"
  AND u."twoFactorEnabled" = true
  AND c."confirmedAt" IS NULL;
