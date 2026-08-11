import { LeadImportService } from "../../leads/lead-import.service";

// parseFile for CSV needs no injected deps.
const svc = new LeadImportService(null as any, null as any);

describe("LeadImportService.parseFile — CSV", () => {
  it("parses a headered CSV with Arabic headers", async () => {
    const csv = "الاسم,الجوال,الموقع\nمكتب المحاماة,0501234567,https://example.com\nشركة ألف,0509999999,";
    const rows = await svc.parseFile("leads.csv", "text/csv", Buffer.from(csv, "utf8"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "مكتب المحاماة", phone: "0501234567", website: "https://example.com" });
    expect(rows[1].website).toBeUndefined();
  });

  it("parses a headerless CSV positionally", async () => {
    const csv = "مكتب,0501112222";
    const rows = await svc.parseFile("x.csv", "text/csv", Buffer.from(csv, "utf8"));
    expect(rows[0]).toMatchObject({ name: "مكتب", phone: "0501112222" });
  });

  it("handles quoted fields containing commas", async () => {
    const csv = 'name,phone\n"مكتب, للاستشارات",0501234567';
    const rows = await svc.parseFile("x.csv", "text/csv", Buffer.from(csv, "utf8"));
    expect(rows[0].name).toBe("مكتب, للاستشارات");
  });

  it("rejects an empty file", async () => {
    await expect(svc.parseFile("x.csv", "text/csv", Buffer.from("", "utf8"))).rejects.toThrow();
  });

  it("rejects an unsupported extension", async () => {
    await expect(svc.parseFile("x.exe", "application/octet-stream", Buffer.from("a,b", "utf8"))).rejects.toThrow();
  });
});
