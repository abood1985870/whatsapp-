import { Injectable, Logger } from "@nestjs/common";
import { lookup } from "dns/promises";
import { isIP } from "net";
import * as http from "http";
import * as https from "https";

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
      // validateUrl returns the addresses it approved, and the request is then
      // PINNED to one of them. See requestPinned for why that matters.
      const { url, addresses } = await this.validateUrlWithAddresses(currentUrl);
      const response = await this.requestPinned(url, addresses[0]);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers["location"];
        if (!location) throw new UnsafeUrlError("REDIRECT_WITHOUT_LOCATION");
        currentUrl = new URL(String(location), url).toString();
        continue;
      }

      const contentType = String(response.headers["content-type"] ?? "");
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        throw new UnsafeUrlError("UNSUPPORTED_CONTENT_TYPE");
      }

      return { url: url.toString(), status: response.status, text: response.body };
    }
    throw new UnsafeUrlError("TOO_MANY_REDIRECTS");
  }

  /**
   * Fetch with the resolved address pinned.
   *
   * This is the whole point of the change. `validateUrl` resolved the hostname
   * and checked every returned address was public — and then handed the URL to
   * `fetch`, which resolved the hostname AGAIN, independently. An attacker
   * controlling the authoritative DNS for their own domain answers the first
   * query with a public address and the second with 169.254.169.254, and the
   * validation that just passed is decorative. The window is small and entirely
   * under the attacker's control, which is the definition of a usable one.
   *
   * Node's http/https accept a `lookup` hook that overrides resolution for this
   * request only. Pinning it to the address we already approved closes the
   * window. TLS is unaffected: the connection still carries the hostname for
   * SNI and still validates the certificate against it, so a pinned IP cannot
   * be used to bypass certificate checks either.
   */
  private requestPinned(
    url: URL,
    pinnedAddress: string
  ): Promise<{ status: number; headers: Record<string, any>; body: string }> {
    const transport = url.protocol === "https:" ? https : http;
    const family = isIP(pinnedAddress) === 6 ? 6 : 4;

    return new Promise((resolve, reject) => {
      const request = transport.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: "GET",
          // servername keeps SNI and certificate validation on the hostname.
          servername: url.protocol === "https:" ? url.hostname : undefined,
          timeout: FETCH_TIMEOUT_MS,
          headers: {
            "User-Agent": "QanoAI-BusinessProfiler/1.0 (+https://qanoai.com)",
            Accept: "text/html,application/xhtml+xml",
            Host: url.host,
          },
          lookup: (_hostname: string, _options: any, callback: any) => {
            callback(null, pinnedAddress, family);
          },
        } as any,
        (response) => {
          const chunks: Buffer[] = [];
          let total = 0;
          response.on("data", (chunk: Buffer) => {
            total += chunk.length;
            if (total > MAX_BODY_BYTES) {
              response.destroy();
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers as Record<string, any>,
              body: Buffer.concat(chunks).toString("utf-8"),
            })
          );
          response.on("error", reject);
          // A body cut short by the size cap still returns what was read.
          response.on("close", () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers as Record<string, any>,
              body: Buffer.concat(chunks).toString("utf-8"),
            })
          );
        }
      );

      request.on("timeout", () => {
        request.destroy(new UnsafeUrlError("TIMEOUT"));
      });
      request.on("error", reject);
      request.end();
    });
  }

  async validateUrl(rawUrl: string): Promise<URL> {
    return (await this.validateUrlWithAddresses(rawUrl)).url;
  }

  private async validateUrlWithAddresses(rawUrl: string): Promise<{ url: URL; addresses: string[] }> {
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
    return { url, addresses };
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
