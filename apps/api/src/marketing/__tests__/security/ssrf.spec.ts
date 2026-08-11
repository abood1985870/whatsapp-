import { SafeWebsiteFetcher, UnsafeUrlError } from "../../website/safe-website-fetcher";

const fetcher = new SafeWebsiteFetcher();

describe("SafeWebsiteFetcher.validateUrl — SSRF protection", () => {
  it("rejects non-http(s) protocols", async () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com", "gopher://x"]) {
      await expect(fetcher.validateUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });

  it("rejects localhost and internal TLDs", async () => {
    for (const url of ["http://localhost/", "http://foo.localhost/", "http://svc.internal/", "http://db.local/"]) {
      await expect(fetcher.validateUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });

  it("rejects private and loopback IP literals", async () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://0.0.0.0/",
    ]) {
      await expect(fetcher.validateUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });

  it("rejects the cloud metadata endpoint and link-local range", async () => {
    await expect(fetcher.validateUrl("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects CGNAT range 100.64.0.0/10", async () => {
    await expect(fetcher.validateUrl("http://100.64.0.1/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects IPv6 loopback and link-local", async () => {
    await expect(fetcher.validateUrl("http://[::1]/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(fetcher.validateUrl("http://[fe80::1]/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects credentials embedded in the URL", async () => {
    await expect(fetcher.validateUrl("http://user:pass@8.8.8.8/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("accepts a public IP literal", async () => {
    const url = await fetcher.validateUrl("http://8.8.8.8/");
    expect(url.hostname).toBe("8.8.8.8");
  });
});
