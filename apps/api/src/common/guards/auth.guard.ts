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

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.AUTH_SECRET,
      });

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          memberships: {
            include: { role: { include: { permissions: { include: { permission: true } } } } },
          },
        },
      });

      if (!user || user.status !== "ACTIVE") {
        throw new UnauthorizedException("USER_INACTIVE");
      }

      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException("TOKEN_INVALID");
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}
