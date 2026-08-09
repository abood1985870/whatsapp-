import { ForbiddenException, Injectable, BadRequestException, ConflictException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import * as bcrypt from "bcryptjs";
import { generateCorrelationId } from "@qanoai/shared";

@Injectable()
export class PlatformService {
  private assertPlatformOwner(user: any) {
    const isPlatformOwner = (user?.memberships || []).some(
      (membership: any) => membership.status === "ACTIVE" && membership.role?.name === "PLATFORM_SUPER_ADMIN"
    );
    if (!isPlatformOwner) throw new ForbiddenException("PLATFORM_OWNER_REQUIRED");
  }

  async getOverview(user: any): Promise<any> {
    this.assertPlatformOwner(user);
    const [organizations, users, activeSubscriptions, trialSubscriptions, whatsappConnections, connectedWhatsApp] =
      await Promise.all([
        prisma.organization.count({ where: { deletedAt: null } }),
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.subscription.count({ where: { status: "ACTIVE" } }),
        prisma.subscription.count({ where: { status: "TRIAL" } }),
        prisma.channelConnection.count({ where: { deletedAt: null } }),
        prisma.channelConnection.count({ where: { deletedAt: null, status: "CONNECTED" } }),
      ]);

    return {
      organizations,
      users,
      activeSubscriptions,
      trialSubscriptions,
      whatsappConnections,
      connectedWhatsApp,
    };
  }

  async listOrganizations(user: any): Promise<any> {
    this.assertPlatformOwner(user);
    return prisma.organization.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { memberships: true, channelConnections: true, conversations: true, contacts: true } },
        subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
  }

  async listSubscriptions(user: any): Promise<any> {
    this.assertPlatformOwner(user);
    return prisma.subscription.findMany({
      orderBy: { createdAt: "desc" },
      include: { organization: true, plan: true },
    });
  }

  async createCustomer(user: any, dto: any): Promise<any> {
    this.assertPlatformOwner(user);

    const email = String(dto?.email || "").trim().toLowerCase();
    const name = String(dto?.name || "").trim();
    const organizationName = String(dto?.organizationName || "").trim();
    const password = String(dto?.password || "").trim();

    if (!email || !name || !organizationName || password.length < 8) {
      throw new BadRequestException("CUSTOMER_NAME_EMAIL_ORG_AND_PASSWORD_REQUIRED");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("EMAIL_ALREADY_EXISTS");

    const [ownerRole, basicPlan] = await Promise.all([
      prisma.role.findFirst({ where: { name: "ORGANIZATION_OWNER", organizationId: null } }),
      prisma.plan.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    ]);
    if (!ownerRole) throw new BadRequestException("ORGANIZATION_OWNER_ROLE_MISSING");

    const passwordHash = await bcrypt.hash(password, 12);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx: any) => {
      const createdUser = await tx.user.create({
        data: { email, name, passwordHash, emailVerifiedAt: new Date(), preferredLocale: "ar" },
      });

      const organization = await tx.organization.create({
        data: {
          slug: `org-${generateCorrelationId().slice(0, 8)}`,
          legalName: organizationName,
          displayName: organizationName,
          status: "TRIAL",
          trialEndsAt,
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: createdUser.id,
          organizationId: organization.id,
          roleId: ownerRole.id,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      let subscription = null;
      if (basicPlan) {
        subscription = await tx.subscription.create({
          data: {
            organizationId: organization.id,
            planId: basicPlan.id,
            status: "TRIAL",
            currentPeriodStart: new Date(),
            currentPeriodEnd: trialEndsAt,
          },
        });
      }

      const { passwordHash: _passwordHash, ...safeUser } = createdUser;
      return { user: safeUser, organization, membership, subscription };
    });

    return result;
  }
}
