import { Injectable } from "@nestjs/common";
import { DiscoveredLead, DiscoveryProviderStatus, DiscoveryQuery, LeadDiscoveryProvider } from "./lead-discovery.provider";

/**
 * Deterministic mock provider for development, simulation mode, and tests.
 * Never returns real business data. Phone numbers use the fictional
 * 9665xx range derived from a hash of the query so reruns are stable.
 */
@Injectable()
export class MockDiscoveryProvider implements LeadDiscoveryProvider {
  readonly id = "MOCK";

  async getStatus(): Promise<DiscoveryProviderStatus> {
    return "TEST_ONLY";
  }

  async discover(query: DiscoveryQuery): Promise<DiscoveredLead[]> {
    const count = Math.min(query.requestedCount, 100);
    const seed = this.hash(`${query.businessType}|${query.city}`);
    const leads: DiscoveredLead[] = [];
    for (let i = 0; i < count; i++) {
      const n = (seed + i * 7919) % 100000000;
      const phone = `9665${String(n).padStart(8, "0")}`;
      leads.push({
        businessName: `${query.businessType} ${query.city} ${i + 1} (تجريبي)`,
        phone,
        website: i % 3 === 0 ? `https://example-${(seed + i) % 9973}.example.com` : undefined,
        city: query.city,
        providerRef: `mock-${seed}-${i}`,
      });
    }
    return leads;
  }

  private hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }
}
