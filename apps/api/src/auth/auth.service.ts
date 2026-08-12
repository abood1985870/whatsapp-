import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { prisma } from "@qanoai/database";
import { config } from "@qanoai/config";
import { encryptSecret, decryptSecret } from "@qanoai/shared";
import { generateCorrelationId } from "@qanoai/shared";
import { v4 as uuidv4 } from "uuid";
// @ts-ignore
import { authenticator } from "otplib";

/**
 * A bcrypt hash of a value nobody knows, compared against when the account does
 * not exist. Without it, "no such user" returns in ~1ms and "wrong password"
 * takes ~100ms, which is a reliable account-existence oracle over the network.
 */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.9OMTOu6Rrl0F/gGDrPO.9V.pMJDDvFy";

/** Access tokens are short-lived; the session row is what keeps a user signed in. */
const ACCESS_TOKEN_TTL = "12h";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private jwtService: JwtService) {}

  async register(dto: { name: string; email: string; password: string; organizationName: string }): Promise<any> {
    const existing = await prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("EMAIL_ALREADY_EXISTS");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        // NOT verified. This set emailVerifiedAt at registration, which meant
        // every address in the system was marked as proven when none had been
        // checked — the flag said "we confirmed this person owns this inbox"
        // and it was never true. Verification is a separate, deliberate step;
        // marking it done here made the column meaningless.
        emailVerifiedAt: null,
      },
    });

    const org = await prisma.organization.create({
      data: {
        slug: `org-${generateCorrelationId().slice(0, 8)}`,
        legalName: dto.organizationName,
        displayName: dto.organizationName,
      },
    });

    // The GLOBAL system role. `findFirst({ where: { name } })` would happily
    // return a tenant's own role that happens to be called ORGANIZATION_OWNER,
    // handing every new signup whatever permissions that role carries.
    const ownerRole = await prisma.role.findFirst({
      where: { name: "ORGANIZATION_OWNER", organizationId: null, isSystem: true },
    });
    if (ownerRole) {
      await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          roleId: ownerRole.id,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });
    }

    const token = await this.issueSession(user);
    return { user: this.sanitizeUser(user), organization: org, accessToken: token };
  }

  async login(email: string, password: string, context?: { ip?: string; userAgent?: string }): Promise<any> {
    const user = await prisma.user.findFirst({
      // deletedAt: null — a soft-deleted user could still sign in and keep every
      // membership they had. "Removing" someone did not remove their access.
      where: { email, deletedAt: null },
      include: {
        memberships: {
          include: {
            organization: true,
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });

    if (!user) {
      // Same work, same shape, same timing as a wrong password.
      await bcrypt.compare(password, DUMMY_HASH);
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.recordFailedLogin(user.id, email, context);
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    }

    if (user.status !== "ACTIVE") {
      throw new UnauthorizedException("USER_INACTIVE");
    }

    // 2FA was previously stored on the user and then never consulted: a user who
    // had enabled it was signed straight in by password alone. The password
    // check now buys only a short-lived token that can do exactly one thing —
    // exchange a TOTP code for a real session.
    if (user.twoFactorEnabled) {
      const mfaToken = await this.jwtService.signAsync(
        { sub: user.id, typ: "mfa_pending" },
        { expiresIn: "5m" }
      );
      return { mfaRequired: true, mfaToken };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await this.issueSession(user, context);
    return { user: this.sanitizeUser(user), memberships: user.memberships, accessToken: token };
  }

  /** Second step of a 2FA login: exchange the pending token plus a code for a session. */
  async loginMfa(mfaToken: string, code: string, context?: { ip?: string; userAgent?: string }): Promise<any> {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(mfaToken);
    } catch {
      throw new UnauthorizedException("MFA_TOKEN_INVALID");
    }
    if (payload?.typ !== "mfa_pending" || !payload?.sub) {
      throw new UnauthorizedException("MFA_TOKEN_INVALID");
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      include: {
        memberships: {
          include: {
            organization: true,
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("USER_INACTIVE");

    const credential = await prisma.twoFactorCredential.findFirst({
      where: { userId: user.id, confirmedAt: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    if (!credential) throw new UnauthorizedException("2FA_NOT_SETUP");

    if (!authenticator.verify({ token: code, secret: this.readSecret(credential.secret) })) {
      await this.recordFailedLogin(user.id, user.email, context, "MFA");
      throw new UnauthorizedException("INVALID_TOKEN");
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = await this.issueSession(user, context);
    return { user: this.sanitizeUser(user), memberships: user.memberships, accessToken: token };
  }

  async getProfile(userId: string): Promise<any> {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        memberships: {
          include: {
            organization: true,
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });
    return this.sanitizeUser(user);
  }

  /**
   * Mint an access token AND the session row that makes it revocable.
   *
   * A bare JWT cannot be withdrawn. Before this, logout returned
   * `{ success: true }` and did nothing at all — a stolen token stayed valid for
   * its full seven days, and changing your password did not end any session.
   * The token now carries a `jti` that AuthGuard looks up; deleting the row is
   * what makes a token stop working.
   */
  private async issueSession(user: any, context?: { ip?: string; userAgent?: string }): Promise<string> {
    const jti = uuidv4();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    // strictUndefinedChecks rejects an explicit `undefined` value for a field —
    // it must be omitted, not set to undefined, when there is no ip/userAgent
    // (register() calls issueSession with no context at all).
    await prisma.session.create({
      data: {
        userId: user.id,
        token: jti,
        expiresAt,
        ...(context?.ip ? { ipAddress: context.ip } : {}),
        ...(context?.userAgent ? { userAgent: context.userAgent.slice(0, 500) } : {}),
      },
    });

    return this.jwtService.signAsync(
      { sub: user.id, email: user.email, jti },
      { expiresIn: ACCESS_TOKEN_TTL }
    );
  }

  private async recordFailedLogin(
    userId: string,
    email: string,
    context?: { ip?: string; userAgent?: string },
    kind = "PASSWORD"
  ) {
    // A failed sign-in leaves a trace. Without one there is no way to notice a
    // password-spraying run against real accounts.
    //
    // The column is `ipHash`, not `ipAddress` — the schema deliberately keeps a
    // hash so addresses can be correlated across rows without the log itself
    // becoming a store of personal data. `email` is not written here for the
    // same reason; the actor id identifies the account.
    await prisma.auditLog
      .create({
        data: {
          actorUserId: userId,
          actorType: "USER",
          action: `AUTH_LOGIN_FAILED_${kind}`,
          resourceType: "User",
          resourceId: userId,
          ...(context?.ip ? { ipHash: this.hashIp(context.ip) } : {}),
          ...(context?.userAgent ? { userAgent: context.userAgent.slice(0, 500) } : {}),
          correlationId: generateCorrelationId(),
        },
      })
      .catch((e) => this.logger.warn(`Could not write failed-login audit row: ${e?.message}`));
  }

  /**
   * Reads a stored TOTP seed. Rows written before encryption shipped are
   * plaintext and are returned unchanged, so no one is locked out mid-migration.
   */
  private readSecret(stored: string): string {
    return decryptSecret(stored, config.CREDENTIAL_ENCRYPTION_KEY);
  }

  /** Salted with AUTH_SECRET so the hashes are not reversible via a rainbow table of the IPv4 space. */
  private hashIp(ip: string): string {
    return createHash("sha256")
      .update(`${process.env.AUTH_SECRET ?? ""}:${ip}`)
      .digest("hex");
  }

  private sanitizeUser(user: any) {
    if (!user) return null;
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }

  async forgotPassword(email: string): Promise<any> {
    const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });

    if (user) {
      // Invalidate any earlier outstanding reset for this account. Several
      // simultaneously-valid links multiply the window and make it impossible
      // to tell which one was used.
      await prisma.verification.deleteMany({ where: { userId: user.id, type: "PASSWORD_RESET" } });

      const token = uuidv4();
      await prisma.verification.create({
        data: {
          userId: user.id,
          email,
          token,
          type: "PASSWORD_RESET",
          // 30 minutes, not 24 hours. A password-reset link is a live key to
          // the account; leaving it usable for a day means a link sitting in an
          // inbox, a forwarded email, or a shared screen stays usable for a day.
          expiresAt: new Date(Date.now() + 1000 * 60 * 30),
        },
      });
    }

    // Byte-identical for both branches. The old code returned `{ success: true }`
    // for an unknown address and `{ success: true, message: ... }` for a known
    // one — a free account-existence check for anyone who looked at the body.
    return { success: true, message: "If the email exists, a reset link has been sent." };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<any> {
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException("USER_NOT_FOUND");

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException("CURRENT_PASSWORD_INCORRECT");

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Changing a password is how someone reacts to a suspected compromise. It
    // has to end every other session, or the attacker simply keeps theirs.
    await prisma.session.deleteMany({ where: { userId } });
    return { success: true, sessionsRevoked: true };
  }

  async updateProfile(userId: string, name: string): Promise<any> {
    const user = await prisma.user.update({ where: { id: userId }, data: { name } });
    return this.sanitizeUser(user);
  }

  async resetPassword(token: string, newPassword: string): Promise<any> {
    const verification = await prisma.verification.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verification || verification.type !== "PASSWORD_RESET" || verification.expiresAt < new Date()) {
      throw new UnauthorizedException("INVALID_OR_EXPIRED_TOKEN");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: verification.userId as string },
      data: { passwordHash },
    });

    await prisma.session.deleteMany({ where: { userId: verification.userId as string } });
    await prisma.verification.delete({ where: { id: verification.id } });
    return { success: true };
  }

  async verifyEmail(token: string): Promise<any> {
    const verification = await prisma.verification.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verification || verification.type !== "EMAIL_VERIFICATION" || verification.expiresAt < new Date()) {
      throw new UnauthorizedException("INVALID_OR_EXPIRED_TOKEN");
    }

    await prisma.user.update({
      where: { id: verification.userId as string },
      data: { emailVerifiedAt: new Date() },
    });

    await prisma.verification.delete({ where: { id: verification.id } });
    return { success: true };
  }

  /** Rotates the session: the old jti stops working the moment the new one is issued. */
  async refreshToken(userId: string, jti?: string, context?: { ip?: string; userAgent?: string }): Promise<any> {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        memberships: {
          include: {
            organization: true,
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("USER_NOT_FOUND");

    if (jti) await prisma.session.deleteMany({ where: { userId, token: jti } });
    const token = await this.issueSession(user, context);
    return { user: this.sanitizeUser(user), memberships: user.memberships, accessToken: token };
  }

  /** Actually ends the session. This used to be a no-op returning success. */
  async logout(userId: string, jti?: string): Promise<any> {
    if (jti) {
      await prisma.session.deleteMany({ where: { userId, token: jti } });
    } else {
      await prisma.session.deleteMany({ where: { userId } });
    }
    return { success: true };
  }

  async logoutAll(userId: string): Promise<any> {
    const result = await prisma.session.deleteMany({ where: { userId } });
    return { success: true, sessionsRevoked: result.count };
  }

  /**
   * Hands back a secret and a QR URL. The credential is stored UNCONFIRMED:
   * previously it was written as if active, so a user who scanned the QR and
   * then closed the tab had 2FA half-enabled, with no way to complete it and a
   * dangling secret in the database.
   */
  async setup2Fa(userId: string): Promise<any> {
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException("USER_NOT_FOUND");

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, "QanoAI", secret);

    // Only ever one pending credential per user.
    await prisma.twoFactorCredential.deleteMany({ where: { userId, confirmedAt: null } });
    // The seed is encrypted at rest. Anyone holding a plaintext TOTP seed can
    // mint valid codes forever, so a database dump was a permanent 2FA bypass.
    await prisma.twoFactorCredential.create({
      data: { userId, secret: encryptSecret(secret, config.CREDENTIAL_ENCRYPTION_KEY) },
    });

    return { secret, otpauthUrl };
  }

  async verify2Fa(userId: string, token: string): Promise<any> {
    const credential = await prisma.twoFactorCredential.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (!credential) throw new UnauthorizedException("2FA_NOT_SETUP");

    const isValid = authenticator.verify({ token, secret: this.readSecret(credential.secret) });
    if (!isValid) throw new UnauthorizedException("INVALID_TOKEN");

    await prisma.twoFactorCredential.update({
      where: { id: credential.id },
      data: { confirmedAt: new Date() },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    return { success: true };
  }

  /**
   * Turning 2FA off is a security downgrade, so it costs a proof: either a
   * current TOTP code or the account password. It previously took neither — a
   * stolen session could strip the second factor and keep the account.
   */
  async disable2Fa(userId: string, proof: { token?: string; password?: string }): Promise<any> {
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException("USER_NOT_FOUND");

    let proven = false;

    if (proof?.token) {
      const credential = await prisma.twoFactorCredential.findFirst({
        where: { userId, confirmedAt: { not: null } },
        orderBy: { createdAt: "desc" },
      });
      proven = !!credential && authenticator.verify({ token: proof.token, secret: this.readSecret(credential.secret) });
    }

    if (!proven && proof?.password) {
      proven = await bcrypt.compare(proof.password, user.passwordHash);
    }

    if (!proven) throw new BadRequestException("PROOF_REQUIRED");

    await prisma.twoFactorCredential.deleteMany({ where: { userId } });
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false },
    });
    return { success: true };
  }
}
