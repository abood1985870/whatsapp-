const db: any = {
  user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  session: { create: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn() },
  twoFactorCredential: { findFirst: jest.fn(), deleteMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  verification: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
  auditLog: { create: jest.fn() },
  role: { findFirst: jest.fn() },
  membership: { create: jest.fn() },
  organization: { create: jest.fn() },
};
jest.mock("@qanoai/database", () => ({ prisma: db }));
jest.mock("@qanoai/config", () => ({
  config: { AUTH_SECRET: "test-secret", CREDENTIAL_ENCRYPTION_KEY: "a-test-key-of-at-least-32-characters!!" },
}));

const verifyTotp = jest.fn();
jest.mock("otplib", () => ({
  authenticator: {
    generateSecret: () => "SECRET",
    keyuri: () => "otpauth://x",
    verify: (...a: any[]) => verifyTotp(...a),
  },
}));

import * as bcrypt from "bcryptjs";
import { AuthService } from "../../auth.service";

/**
 * Authentication hardening.
 *
 * Four things were wrong at once: 2FA was recorded but never enforced, logout
 * did nothing, a soft-deleted user could still sign in, and the login and
 * forgot-password responses told an anonymous caller which email addresses had
 * accounts.
 */
describe("AuthService hardening", () => {
  let service: AuthService;
  const jwt: any = {
    signAsync: jest.fn(async (payload: any) => `token:${JSON.stringify(payload)}`),
    verifyAsync: jest.fn(),
  };

  const activeUser = (over: any = {}) => ({
    id: "u-1",
    email: "a@b.com",
    passwordHash: bcrypt.hashSync("correct-horse", 4),
    status: "ACTIVE",
    twoFactorEnabled: false,
    memberships: [],
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(jwt);
    db.session.create.mockResolvedValue({});
    db.session.deleteMany.mockResolvedValue({ count: 1 });
    db.user.update.mockResolvedValue({});
    db.auditLog.create.mockResolvedValue({});
    db.verification.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe("login", () => {
    it("excludes soft-deleted users", async () => {
      db.user.findFirst.mockResolvedValue(null);
      await expect(service.login("a@b.com", "x")).rejects.toThrow("INVALID_CREDENTIALS");
      expect(db.user.findFirst.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
    });

    it("gives the same answer for an unknown email as for a wrong password", async () => {
      db.user.findFirst.mockResolvedValue(null);
      const unknown = await service.login("nobody@b.com", "x").catch((e) => e.message);

      db.user.findFirst.mockResolvedValue(activeUser());
      const wrongPassword = await service.login("a@b.com", "wrong").catch((e) => e.message);

      expect(unknown).toBe(wrongPassword);
    });

    it("still does password work for an unknown email, so timing does not leak", async () => {
      // Not a spy — bcryptjs exports non-configurable properties. Measured
      // instead: an early return would come back in under a millisecond, while a
      // real bcrypt comparison against the dummy hash cannot.
      db.user.findFirst.mockResolvedValue(null);
      const started = Date.now();
      await service.login("nobody@b.com", "x").catch(() => {});
      expect(Date.now() - started).toBeGreaterThan(20);
    });

    it("records a failed attempt against the account", async () => {
      db.user.findFirst.mockResolvedValue(activeUser());
      await service.login("a@b.com", "wrong", { ip: "1.2.3.4" }).catch(() => {});
      expect(db.auditLog.create).toHaveBeenCalled();
      const row = db.auditLog.create.mock.calls[0][0].data;
      expect(row.action).toBe("AUTH_LOGIN_FAILED_PASSWORD");
      expect(row.actorUserId).toBe("u-1");
      // The raw address is never stored.
      expect(JSON.stringify(row)).not.toContain("1.2.3.4");
    });

    it("does NOT issue a session when 2FA is enabled — this was the bug", async () => {
      db.user.findFirst.mockResolvedValue(activeUser({ twoFactorEnabled: true }));
      const result = await service.login("a@b.com", "correct-horse");

      expect(result.mfaRequired).toBe(true);
      expect(result.accessToken).toBeUndefined();
      expect(db.session.create).not.toHaveBeenCalled();
    });

    it("refuses a non-active user", async () => {
      db.user.findFirst.mockResolvedValue(activeUser({ status: "SUSPENDED" }));
      await expect(service.login("a@b.com", "correct-horse")).rejects.toThrow("USER_INACTIVE");
    });

    it("issues a revocable session on success", async () => {
      db.user.findFirst.mockResolvedValue(activeUser());
      await service.login("a@b.com", "correct-horse", { ip: "1.2.3.4" });
      expect(db.session.create).toHaveBeenCalled();
      const payload = jwt.signAsync.mock.calls[0][0];
      expect(payload.jti).toBeDefined();
      expect(db.session.create.mock.calls[0][0].data.token).toBe(payload.jti);
    });
  });

  describe("loginMfa", () => {
    it("rejects an ordinary access token used as an MFA token", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: "u-1", jti: "j" });
      await expect(service.loginMfa("t", "123456")).rejects.toThrow("MFA_TOKEN_INVALID");
    });

    it("rejects a wrong code and records it", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: "u-1", typ: "mfa_pending" });
      db.user.findFirst.mockResolvedValue(activeUser({ twoFactorEnabled: true }));
      db.twoFactorCredential.findFirst.mockResolvedValue({ secret: "S" });
      verifyTotp.mockReturnValue(false);

      await expect(service.loginMfa("t", "000000")).rejects.toThrow("INVALID_TOKEN");
      expect(db.session.create).not.toHaveBeenCalled();
      expect(db.auditLog.create).toHaveBeenCalled();
    });

    it("only accepts a CONFIRMED credential", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: "u-1", typ: "mfa_pending" });
      db.user.findFirst.mockResolvedValue(activeUser({ twoFactorEnabled: true }));
      db.twoFactorCredential.findFirst.mockResolvedValue(null);
      await expect(service.loginMfa("t", "123456")).rejects.toThrow("2FA_NOT_SETUP");
      expect(db.twoFactorCredential.findFirst.mock.calls[0][0].where.confirmedAt).toEqual({ not: null });
    });

    it("issues a session on a good code", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: "u-1", typ: "mfa_pending" });
      db.user.findFirst.mockResolvedValue(activeUser({ twoFactorEnabled: true }));
      db.twoFactorCredential.findFirst.mockResolvedValue({ secret: "S" });
      verifyTotp.mockReturnValue(true);

      const result = await service.loginMfa("t", "123456");
      expect(result.accessToken).toBeDefined();
      expect(db.session.create).toHaveBeenCalled();
    });
  });

  describe("session lifecycle", () => {
    it("logout deletes the session row", async () => {
      await service.logout("u-1", "jti-1");
      expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1", token: "jti-1" } });
    });

    it("logout without a jti ends every session", async () => {
      await service.logout("u-1");
      expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
    });

    it("changing the password revokes every session", async () => {
      db.user.findFirst.mockResolvedValue(activeUser());
      await service.changePassword("u-1", "correct-horse", "a-much-longer-one");
      expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
    });

    it("resetting the password revokes every session", async () => {
      db.verification.findUnique.mockResolvedValue({
        id: "v-1",
        userId: "u-1",
        type: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + 10000),
      });
      db.verification.delete.mockResolvedValue({});
      await service.resetPassword("tok", "a-much-longer-one");
      expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
    });

    it("refresh rotates: the old jti is deleted", async () => {
      db.user.findFirst.mockResolvedValue(activeUser());
      await service.refreshToken("u-1", "old-jti");
      expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1", token: "old-jti" } });
      expect(db.session.create).toHaveBeenCalled();
    });
  });

  describe("forgotPassword", () => {
    it("returns an identical body whether or not the account exists", async () => {
      db.user.findFirst.mockResolvedValue(null);
      const missing = await service.forgotPassword("nobody@b.com");

      db.user.findFirst.mockResolvedValue(activeUser());
      db.verification.create.mockResolvedValue({});
      const present = await service.forgotPassword("a@b.com");

      expect(missing).toEqual(present);
    });

    it("only writes a reset token for a real account", async () => {
      db.user.findFirst.mockResolvedValue(null);
      await service.forgotPassword("nobody@b.com");
      expect(db.verification.create).not.toHaveBeenCalled();
    });

    it("invalidates any earlier outstanding reset link", async () => {
      db.user.findFirst.mockResolvedValue(activeUser());
      db.verification.create.mockResolvedValue({});
      await service.forgotPassword("a@b.com");
      // Several simultaneously-valid links multiply the window and make it
      // impossible to tell which one was used.
      expect(db.verification.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u-1", type: "PASSWORD_RESET" },
      });
    });

    it("issues a link that expires in well under an hour", async () => {
      db.user.findFirst.mockResolvedValue(activeUser());
      db.verification.create.mockResolvedValue({});
      const before = Date.now();
      await service.forgotPassword("a@b.com");
      const { expiresAt } = db.verification.create.mock.calls[0][0].data;
      const lifetimeMinutes = (new Date(expiresAt).getTime() - before) / 60000;
      // It was 24 hours: a live key to the account sitting in an inbox all day.
      expect(lifetimeMinutes).toBeLessThanOrEqual(31);
      expect(lifetimeMinutes).toBeGreaterThan(1);
    });
  });

  describe("2FA management", () => {
    it("setup stores the credential unconfirmed", async () => {
      db.user.findFirst.mockResolvedValue(activeUser());
      db.twoFactorCredential.deleteMany.mockResolvedValue({});
      db.twoFactorCredential.create.mockResolvedValue({});
      await service.setup2Fa("u-1");
      expect(db.twoFactorCredential.create.mock.calls[0][0].data.confirmedAt).toBeUndefined();
      expect(db.user.update).not.toHaveBeenCalled();
    });

    it("never stores the TOTP seed in the clear", async () => {
      db.user.findFirst.mockResolvedValue(activeUser());
      db.twoFactorCredential.deleteMany.mockResolvedValue({});
      db.twoFactorCredential.create.mockResolvedValue({});

      const { secret } = await service.setup2Fa("u-1");
      const stored = db.twoFactorCredential.create.mock.calls[0][0].data.secret;

      // A plaintext seed in a database dump is a permanent 2FA bypass — codes
      // can be minted from it forever.
      expect(stored).not.toBe(secret);
      expect(stored).not.toContain(secret);
      expect(stored.startsWith("enc:v1:")).toBe(true);
    });

    it("disable refuses with no proof at all", async () => {
      db.user.findFirst.mockResolvedValue(activeUser());
      await expect(service.disable2Fa("u-1", {})).rejects.toThrow("PROOF_REQUIRED");
      expect(db.twoFactorCredential.deleteMany).not.toHaveBeenCalled();
    });

    it("disable refuses a wrong code and a wrong password", async () => {
      db.user.findFirst.mockResolvedValue(activeUser());
      db.twoFactorCredential.findFirst.mockResolvedValue({ secret: "S" });
      verifyTotp.mockReturnValue(false);
      await expect(service.disable2Fa("u-1", { token: "000000", password: "nope" })).rejects.toThrow(
        "PROOF_REQUIRED"
      );
    });

    it("disable accepts the account password", async () => {
      db.user.findFirst.mockResolvedValue(activeUser());
      db.twoFactorCredential.deleteMany.mockResolvedValue({});
      await service.disable2Fa("u-1", { password: "correct-horse" });
      expect(db.twoFactorCredential.deleteMany).toHaveBeenCalled();
    });
  });

  describe("register", () => {
    it("does not mark the email as verified — nothing was checked", async () => {
      db.user.findUnique.mockResolvedValue(null);
      db.user.create.mockResolvedValue(activeUser());
      db.organization.create.mockResolvedValue({ id: "o-1" });
      db.role.findFirst.mockResolvedValue({ id: "r-1" });
      db.membership.create.mockResolvedValue({});

      await service.register({ name: "n", email: "a@b.com", password: "a-much-longer-one", organizationName: "o" });
      expect(db.user.create.mock.calls[0][0].data.emailVerifiedAt).toBeNull();
    });

    it("binds to the GLOBAL owner role, not a tenant role of the same name", async () => {
      db.user.findUnique.mockResolvedValue(null);
      db.user.create.mockResolvedValue(activeUser());
      db.organization.create.mockResolvedValue({ id: "o-1" });
      db.role.findFirst.mockResolvedValue({ id: "r-1" });
      db.membership.create.mockResolvedValue({});

      await service.register({ name: "n", email: "a@b.com", password: "a-much-longer-one", organizationName: "o" });
      expect(db.role.findFirst.mock.calls[0][0].where).toMatchObject({
        name: "ORGANIZATION_OWNER",
        organizationId: null,
        isSystem: true,
      });
    });
  });
});
