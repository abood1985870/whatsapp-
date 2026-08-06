import { Injectable, UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import { v4 as uuidv4 } from "uuid";
// @ts-ignore
import { authenticator } from "otplib";

@Injectable()
export class AuthService {
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
        emailVerifiedAt: new Date(),
      },
    });

    const org = await prisma.organization.create({
      data: {
        slug: `org-${generateCorrelationId().slice(0, 8)}`,
        legalName: dto.organizationName,
        displayName: dto.organizationName,
      },
    });

    const ownerRole = await prisma.role.findFirst({ where: { name: "ORGANIZATION_OWNER" } });
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

    const token = await this.generateToken(user);
    return { user: this.sanitizeUser(user), organization: org, accessToken: token };
  }

  async login(email: string, password: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { email },
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
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await this.generateToken(user);
    return { user: this.sanitizeUser(user), memberships: user.memberships, accessToken: token };
  }

  async getProfile(userId: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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

  private async generateToken(user: any): Promise<any> {
    const payload = { sub: user.id, email: user.email };
    return this.jwtService.signAsync(payload);
  }

  private sanitizeUser(user: any) {
    if (!user) return null;
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }

  async forgotPassword(email: string): Promise<any> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { success: true };

    const token = uuidv4();
    await prisma.verification.create({
      data: {
        userId: user.id,
        email,
        token,
        type: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });

    return { success: true, message: 'If the email exists, a reset link has been sent.' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<any> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("USER_NOT_FOUND");

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException("CURRENT_PASSWORD_INCORRECT");

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { success: true };
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

    if (!verification || verification.type !== 'PASSWORD_RESET' || verification.expiresAt < new Date()) {
      throw new UnauthorizedException('INVALID_OR_EXPIRED_TOKEN');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: verification.userId as string },
      data: { passwordHash },
    });

    await prisma.verification.delete({ where: { id: verification.id } });
    return { success: true };
  }

  async verifyEmail(token: string): Promise<any> {
    const verification = await prisma.verification.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verification || verification.type !== 'EMAIL_VERIFICATION' || verification.expiresAt < new Date()) {
      throw new UnauthorizedException('INVALID_OR_EXPIRED_TOKEN');
    }

    await prisma.user.update({
      where: { id: verification.userId as string },
      data: { emailVerifiedAt: new Date() },
    });

    await prisma.verification.delete({ where: { id: verification.id } });
    return { success: true };
  }

  async refreshToken(userId: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: true,
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException('USER_NOT_FOUND');
    const token = await this.generateToken(user);
    return { user: this.sanitizeUser(user), memberships: user.memberships, accessToken: token };
  }

  async logout(userId: string): Promise<any> {
    return { success: true };
  }

  async setup2Fa(userId: string): Promise<any> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('USER_NOT_FOUND');

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, 'QanoAI', secret);

    await prisma.twoFactorCredential.create({
      data: {
        userId,
        secret,
      }
    });
    
    return { secret, otpauthUrl };
  }

  async verify2Fa(userId: string, token: string): Promise<any> {
    const credential = await prisma.twoFactorCredential.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    if (!credential) throw new UnauthorizedException('2FA_NOT_SETUP');

    const isValid = authenticator.verify({ token, secret: credential.secret });
    if (!isValid) throw new UnauthorizedException('INVALID_TOKEN');

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    return { success: true };
  }

  async disable2Fa(userId: string): Promise<any> {
    await prisma.twoFactorCredential.deleteMany({ where: { userId } });
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false },
    });
    return { success: true };
  }
}
