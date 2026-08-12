export interface DiscoveredLead {
  businessName: string;
  phone: string;
  website?: string;
  city?: string;
  providerRef?: string;
}

export type DiscoveryProviderStatus = "LIVE_VERIFIED" | "CONFIGURATION_REQUIRED" | "TEST_ONLY" | "ERROR";

export interface DiscoveryQuery {
  businessType: string;
  city: string;
  requestedCount: number;
}

export interface LeadDiscoveryProvider {
  readonly id: string;
  getStatus(): Promise<DiscoveryProviderStatus>;
  discover(query: DiscoveryQuery): Promise<DiscoveredLead[]>;
}
