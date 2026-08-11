import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { summarizeWebsite } from "@qanoai/ai";
import { SafeWebsiteFetcher } from "./safe-website-fetcher";

const MAX_PAGES = 3;
const SUBPAGE_KEYWORDS = ["service", "services", "about", "خدمات", "من-نحن", "عن-", "about-us"];

/**
 * Fetches up to 3 public pages of a lead's website (home + best-guess
 * services/about links) through the SSRF-safe fetcher and produces a
 * structured business profile. A failure never fails the lead — the
 * profile is stored with fetchStatus FAILED and personalization falls
 * back to name/category/product.
 */
@Injectable()
export class WebsiteIntelligenceService {
  private readonly logger = new Logger(WebsiteIntelligenceService.name);

  constructor(private readonly fetcher: SafeWebsiteFetcher) {}

  async analyzeForLead(organizationId: string, leadId: string, productName: string): Promise<string | null> {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
    if (!lead?.website) return null;

    // Reuse a recent successful profile for the same host in this org.
    let host: string;
    try {
      host = new URL(lead.website).hostname.toLowerCase();
    } catch {
      return null;
    }
    const recent = await prisma.websiteProfile.findFirst({
      where: {
        organizationId,
        normalizedHost: host,
        fetchStatus: "OK",
        fetchedAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      },
      orderBy: { fetchedAt: "desc" },
    });
    if (recent) {
      if (lead.websiteProfileId !== recent.id) {
        await prisma.lead.update({ where: { id: lead.id }, data: { websiteProfileId: recent.id } });
      }
      return recent.id;
    }

    const profile = await prisma.websiteProfile.create({
      data: { organizationId, url: lead.website, normalizedHost: host, fetchStatus: "PENDING" },
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { websiteProfileId: profile.id } });

    try {
      const home = await this.fetcher.fetchPage(lead.website);
      const texts: string[] = [this.extractText(home.text)];

      for (const link of this.findSubpages(home.text, home.url).slice(0, MAX_PAGES - 1)) {
        try {
          const page = await this.fetcher.fetchPage(link);
          texts.push(this.extractText(page.text));
        } catch {
          // one broken subpage never matters
        }
      }

      const summary = await summarizeWebsite({
        businessName: lead.businessName,
        businessType: lead.businessType,
        productName,
        pagesText: texts.join("\n---\n").slice(0, 30000),
      });

      if (!summary.ok || !summary.data) {
        await prisma.websiteProfile.update({
          where: { id: profile.id },
          data: { fetchStatus: "FAILED", errorMessage: summary.error ?? "SUMMARY_FAILED", fetchedAt: new Date() },
        });
        return profile.id;
      }

      await prisma.websiteProfile.update({
        where: { id: profile.id },
        data: {
          fetchStatus: "OK",
          fetchedAt: new Date(),
          businessSummary: summary.data.businessSummary,
          services: summary.data.services,
          relevantContext: summary.data.relevantContext,
          possiblePainPoints: summary.data.possiblePainPoints,
          productFit: summary.data.productFit,
        },
      });
      return profile.id;
    } catch (error: any) {
      const reason = String(error?.message ?? "FETCH_FAILED").slice(0, 300);
      this.logger.warn(`Website analysis failed for lead ${leadId}: ${reason}`);
      await prisma.websiteProfile.update({
        where: { id: profile.id },
        data: { fetchStatus: reason.startsWith("UNSAFE_URL") ? "BLOCKED" : "FAILED", errorMessage: reason, fetchedAt: new Date() },
      });
      return profile.id;
    }
  }

  /** Crude but dependency-free HTML → text extraction. */
  private extractText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&amp;|&quot;|&#\d+;|&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 15000);
  }

  private findSubpages(html: string, baseUrl: string): string[] {
    const links = new Set<string>();
    const base = new URL(baseUrl);
    const matches = html.match(/href=["']([^"'#]+)["']/gi) ?? [];
    for (const m of matches) {
      const raw = m.replace(/^href=["']/i, "").replace(/["']$/, "");
      try {
        const url = new URL(raw, base);
        if (url.hostname !== base.hostname) continue;
        if (url.protocol !== "http:" && url.protocol !== "https:") continue;
        const path = url.pathname.toLowerCase();
        if (SUBPAGE_KEYWORDS.some((k) => path.includes(k))) {
          links.add(url.toString());
        }
      } catch {
        // ignore malformed links
      }
      if (links.size >= 5) break;
    }
    return [...links];
  }
}
