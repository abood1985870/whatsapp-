import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { prisma } from "@qanoai/database";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException("TOKEN_MISSING");
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.AUTH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("TOKEN_INVALID");
    }

    // A token minted for the 2FA step can do exactly one thing: be exchanged
    // for a session. It must never authenticate an ordinary request.
    if (payload?.typ === "mfa_pending") {
      throw new UnauthorizedException("MFA_REQUIRED");
    }

    // The session row is what makes a token revocable. A JWT alone cannot be
    // withdrawn — before this, logout did nothing and a stolen token stayed
    // valid for its full lifetime, through password changes and all.
    if (!payload?.jti) {
      throw new UnauthorizedException("TOKEN_INVALID");
    }
    const session = await prisma.session.findUnique({
      where: { token: payload.jti },
      select: { id: true, userId: true, expiresAt: true },
    });
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException("SESSION_REVOKED");
    }
    if (session.expiresAt <= new Date()) {
      await prisma.session.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedException("SESSION_EXPIRED");
    }

    const user = await prisma.user.findFirst({
      // deletedAt: null — a soft-deleted user kept working sessions and every
      // membership they had.
      where: { id: payload.sub, deletedAt: null },
      // Explicit select: passwordHash used to be loaded onto request.user and
      // travelled into anything that serialised the user object.
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        status: true,
        preferredLocale: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        memberships: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("USER_INACTIVE");
    }

    request.user = user;
    request.sessionJti = payload.jti;
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}
