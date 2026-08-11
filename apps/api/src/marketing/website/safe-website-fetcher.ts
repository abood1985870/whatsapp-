import { Injectable, Logger } from "@nestjs/common";
import { lookup } from "dns/promises";
import { isIP } from "net";

const MAX_BODY_BYTES = 1024 * 1024; // 1MB
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10000;

export interface FetchedPage {
  url: string;
  status: number;
  text: string;
}

export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(`UNSAFE_URL:${reason}`);
  }
}

/**
 * SSRF-hardened fetcher for public marketing websites.
 * http/https only; DNS is resolved and every address must be public;
 * redirects are re-validated per hop; body size, content type, and
 * timeout are capped. Fetched content is UNTRUSTED DATA — callers must
 * never treat it as instructions.
 */
@Injectable()
export class SafeWebsiteFetcher {
  private readonly logger = new Logger(SafeWebsiteFetcher.name);

  async fetchPage(rawUrl: string): Promise<FetchedPage> {
    let currentUrl = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = await this.validateUrl(currentUrl);
      const response = await fetch(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "QanoAI-BusinessProfiler/1.0 (+https://qanoai.com)",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new UnsafeUrlError("REDIRECT_WITHOUT_LOCATION");
        currentUrl = new URL(location, url).toString();
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        throw new UnsafeUrlError("UNSUPPORTED_CONTENT_TYPE");
      }

      const text = await this.readBounded(response);
      return { url: url.toString(), status: response.status, text };
    }
    throw new UnsafeUrlError("TOO_MANY_REDIRECTS");
  }

  async validateUrl(rawUrl: string): Promise<URL> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new UnsafeUrlError("INVALID_URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("PROTOCOL");
    if (url.username || url.password) throw new UnsafeUrlError("CREDENTIALS_IN_URL");

    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
      throw new UnsafeUrlError("INTERNAL_HOST");
    }

    const addresses: string[] = [];
    if (isIP(host)) {
      addresses.push(host);
    } else {
      try {
        const resolved = await lookup(host, { all: true });
        for (const a of resolved) addresses.push(a.address);
      } catch {
        throw new UnsafeUrlError("DNS_RESOLUTION_FAILED");
      }
    }
    if (addresses.length === 0) throw new UnsafeUrlError("DNS_NO_ADDRESSES");
    for (const address of addresses) {
      if (this.isPrivateAddress(address)) throw new UnsafeUrlError("PRIVATE_ADDRESS");
    }
    return url;
  }

  private isPrivateAddress(address: string): boolean {
    if (isIP(address) === 6) {
      const lower = address.toLowerCase();
      if (lower === "::1" || lower === "::") return true;
      if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
      if (lower.startsWith("::ffff:")) return this.isPrivateAddress(lower.slice(7));
      return false;
    }
    const parts = address.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  private async readBounded(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
}
