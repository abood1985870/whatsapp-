import { Injectable, Logger } from "@nestjs/common";
import { config } from "@qanoai/config";
import { DiscoveredLead, DiscoveryProviderStatus, DiscoveryQuery, LeadDiscoveryProvider } from "./lead-discovery.provider";

/**
 * Compliant lead discovery through the documented Google Places API
 * (Text Search + Place Details). No scraping, no anti-bot circumvention.
 * Without GOOGLE_PLACES_API_KEY the provider reports
 * CONFIGURATION_REQUIRED and refuses to run — it never fakes results.
 */
@Injectable()
export class GooglePlacesDiscoveryProvider implements LeadDiscoveryProvider {
  readonly id = "GOOGLE_PLACES";
  private readonly logger = new Logger(GooglePlacesDiscoveryProvider.name);

  async getStatus(): Promise<DiscoveryProviderStatus> {
    if (!config.GOOGLE_PLACES_API_KEY) return "CONFIGURATION_REQUIRED";
    return "LIVE_VERIFIED";
  }

  async discover(query: DiscoveryQuery): Promise<DiscoveredLead[]> {
    const apiKey = config.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_PLACES_CONFIGURATION_REQUIRED");
    }

    const results: DiscoveredLead[] = [];
    const searchText = `${query.businessType} في ${query.city}`;
    let pageToken: string | undefined;

    // Places API returns up to 20 per page, max 3 pages per query.
    for (let page = 0; page < 3 && results.length < query.requestedCount; page++) {
      const body: Record<string, unknown> = {
        textQuery: searchText,
        languageCode: "ar",
        regionCode: "SA",
        pageSize: 20,
      };
      if (pageToken) body.pageToken = pageToken;

      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,nextPageToken",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        this.logger.error(`Places API error ${response.status}: ${text.slice(0, 300)}`);
        throw new Error(`GOOGLE_PLACES_ERROR_${response.status}`);
      }

      const data: any = await response.json();
      for (const place of data.places ?? []) {
        const phone: string | undefined = place.internationalPhoneNumber || place.nationalPhoneNumber;
        if (!phone) continue; // no phone → skip lead (per spec)
        results.push({
          businessName: place.displayName?.text ?? "غير معروف",
          phone,
          website: place.websiteUri || undefined,
          city: query.city,
          providerRef: place.id,
        });
        if (results.length >= query.requestedCount) break;
      }

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    return results;
  }
}
