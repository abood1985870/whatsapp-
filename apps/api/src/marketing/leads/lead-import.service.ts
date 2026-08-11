import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId, normalizePhone, normalizePhoneStrict } from "@qanoai/shared";
import { importLeadsSchema } from "@qanoai/validation";
import { AuditService } from "../../audit/audit.service";
import { DncService } from "../dnc/dnc.service";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const ALLOWED_EXTENSIONS = [".xlsx", ".csv"];
const ALLOWED_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/csv",
  "text/plain",
  "application/octet-stream",
];

export interface ImportRow {
  name?: string;
  phone?: string;
  website?: string;
}

export interface ClassifiedRow extends ImportRow {
  rowNumber: number;
  classification: "VALID" | "INVALID" | "DUPLICATE_IN_FILE" | "DUPLICATE_EXISTING" | "DNC" | "PREVIOUSLY_CONTACTED";
  normalizedPhone?: string;
  error?: string;
}

@Injectable()
export class LeadImportService {
  constructor(private readonly audit: AuditService, private readonly dnc: DncService) {}

  /** Parse an uploaded .xlsx/.csv buffer into raw rows. */
  async parseFile(filename: string, mimeType: string, buffer: Buffer): Promise<ImportRow[]> {
    if (!buffer || buffer.length === 0) throw new BadRequestException("EMPTY_FILE");
    if (buffer.length > MAX_FILE_BYTES) throw new BadRequestException("FILE_TOO_LARGE");
    const ext = (filename.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) throw new BadRequestException("UNSUPPORTED_FILE_TYPE");
    if (mimeType && !ALLOWED_MIME.includes(mimeType.toLowerCase())) {
      throw new BadRequestException("UNSUPPORTED_MIME_TYPE");
    }

    const rows = ext === ".csv" ? this.parseCsv(buffer.toString("utf8")) : await this.parseXlsx(buffer);
    if (rows.length > MAX_ROWS) throw new BadRequestException("TOO_MANY_ROWS");
    return rows;
  }

  /**
   * Classify rows without writing anything: valid / invalid / duplicate
   * (in-file and against existing leads) / DNC / previously contacted.
   */
  async preview(organizationId: string, rows: ImportRow[]): Promise<{ counts: Record<string, number>; rows: ClassifiedRow[] }> {
    const seenInFile = new Set<string>();
    const classified: ClassifiedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;
      const name = row.name?.trim();
      const phoneRaw = row.phone?.trim();

      if (!name || !phoneRaw) {
        classified.push({ ...row, rowNumber, classification: "INVALID", error: "MISSING_NAME_OR_PHONE" });
        continue;
      }
      const { normalized, valid } = normalizePhoneStrict(phoneRaw);
      if (!valid) {
        classified.push({ ...row, rowNumber, classification: "INVALID", error: "INVALID_PHONE" });
        continue;
      }
      if (seenInFile.has(normalized)) {
        classified.push({ ...row, rowNumber, classification: "DUPLICATE_IN_FILE", normalizedPhone: normalized });
        continue;
      }
      seenInFile.add(normalized);

      if (await this.dnc.isBlocked(organizationId, normalized)) {
        classified.push({ ...row, rowNumber, classification: "DNC", normalizedPhone: normalized });
        continue;
      }

      const existing = await prisma.lead.findUnique({
        where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: normalized } },
      });
      if (existing) {
        const contacted = await prisma.campaignRecipient.findFirst({
          where: { leadId: existing.id, isTest: false, status: { in: ["SENT", "REPLIED"] } },
        });
        classified.push({
          ...row,
          rowNumber,
          classification: contacted ? "PREVIOUSLY_CONTACTED" : "DUPLICATE_EXISTING",
          normalizedPhone: normalized,
        });
        continue;
      }

      classified.push({ ...row, rowNumber, classification: "VALID", normalizedPhone: normalized });
    }

    const counts: Record<string, number> = {
      total: rows.length,
      valid: 0,
      invalid: 0,
      duplicate: 0,
      dnc: 0,
      previouslyContacted: 0,
    };
    for (const row of classified) {
      if (row.classification === "VALID") counts.valid++;
      else if (row.classification === "INVALID") counts.invalid++;
      else if (row.classification === "DNC") counts.dnc++;
      else if (row.classification === "PREVIOUSLY_CONTACTED") counts.previouslyContacted++;
      else counts.duplicate++;
    }

    return { counts, rows: classified };
  }

  /** Persist the VALID rows of a previewed import. */
  async commit(dto: unknown, actorUserId: string) {
    const parsed = importLeadsSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const { organizationId, filename, rows } = parsed.data;

    const { counts, rows: classified } = await this.preview(organizationId, rows);

    const importRecord = await prisma.leadImport.create({
      data: {
        organizationId,
        filename: filename.slice(0, 300),
        createdById: actorUserId,
        source: filename.toLowerCase().endsWith(".csv") ? "CSV_IMPORT" : "EXCEL_IMPORT",
        totalRows: counts.total,
        validRows: counts.valid,
        invalidRows: counts.invalid,
        duplicateRows: counts.duplicate,
        dncRows: counts.dnc,
        previouslyContactedRows: counts.previouslyContacted,
      },
    });

    let created = 0;
    for (const row of classified) {
      if (row.classification !== "VALID" || !row.normalizedPhone) continue;
      try {
        const lead = await prisma.lead.create({
          data: {
            organizationId,
            businessName: row.name!.trim(),
            rawPhone: row.phone!.trim(),
            normalizedPhone: row.normalizedPhone,
            legacyNormalizedPhone: normalizePhone(row.phone!),
            website: this.sanitizeWebsite(row.website),
            source: importRecord.source,
            importId: importRecord.id,
            status: "DISCOVERED",
          },
        });
        await prisma.leadStateTransition.create({
          data: { leadId: lead.id, fromStatus: "NONE", toStatus: "DISCOVERED", source: importRecord.source },
        });
        created++;
      } catch {
        // unique-constraint race with a concurrent import: count as duplicate, keep going
      }
    }

    await this.audit.log({
      organizationId,
      actorUserId,
      action: "MARKETING_LEADS_IMPORTED",
      resourceType: "LeadImport",
      resourceId: importRecord.id,
      metadata: { filename, ...counts, created },
      correlationId: generateCorrelationId(),
    });

    return { importId: importRecord.id, counts: { ...counts, created } };
  }

  async listImports(organizationId: string) {
    return prisma.leadImport.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 50 });
  }

  private sanitizeWebsite(website?: string): string | null {
    const w = website?.trim();
    if (!w) return null;
    const candidate = /^https?:\/\//i.test(w) ? w : `https://${w}`;
    try {
      const url = new URL(candidate);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.toString().slice(0, 500);
    } catch {
      return null;
    }
  }

  /** Minimal strict CSV parser for our 3-column shape (handles quoted fields). */
  private parseCsv(text: string): ImportRow[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length === 0) return [];
    const header = this.splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const nameIdx = header.findIndex((h) => ["name", "الاسم", "اسم", "business", "النشاط"].includes(h));
    const phoneIdx = header.findIndex((h) => ["phone", "الجوال", "الهاتف", "رقم", "رقم الجوال", "mobile"].includes(h));
    const webIdx = header.findIndex((h) => ["website", "الموقع", "موقع"].includes(h));
    const hasHeader = nameIdx >= 0 || phoneIdx >= 0;

    const dataLines = hasHeader ? lines.slice(1) : lines;
    return dataLines.map((line) => {
      const cols = this.splitCsvLine(line);
      return {
        name: cols[hasHeader && nameIdx >= 0 ? nameIdx : 0]?.trim(),
        phone: cols[hasHeader && phoneIdx >= 0 ? phoneIdx : 1]?.trim(),
        website: cols[hasHeader && webIdx >= 0 ? webIdx : 2]?.trim() || undefined,
      };
    });
  }

  private splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  private async parseXlsx(buffer: Buffer): Promise<ImportRow[]> {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const rows: ImportRow[] = [];
    let nameIdx = 1;
    let phoneIdx = 2;
    let webIdx = 3;
    let hasHeader = false;

    const headerRow = sheet.getRow(1);
    const headerValues = (headerRow.values as any[]) ?? [];
    for (let c = 1; c < headerValues.length; c++) {
      const value = String(headerValues[c] ?? "").trim().toLowerCase();
      if (["name", "الاسم", "اسم", "النشاط"].includes(value)) {
        nameIdx = c;
        hasHeader = true;
      } else if (["phone", "الجوال", "الهاتف", "رقم", "رقم الجوال", "mobile"].includes(value)) {
        phoneIdx = c;
        hasHeader = true;
      } else if (["website", "الموقع", "موقع"].includes(value)) {
        webIdx = c;
        hasHeader = true;
      }
    }

    sheet.eachRow((row, rowNumber) => {
      if (hasHeader && rowNumber === 1) return;
      const cell = (idx: number) => {
        const v = row.getCell(idx).value;
        if (v === null || v === undefined) return undefined;
        if (typeof v === "object" && "text" in (v as any)) return String((v as any).text);
        if (typeof v === "object" && "hyperlink" in (v as any)) return String((v as any).hyperlink);
        return String(v);
      };
      rows.push({ name: cell(nameIdx), phone: cell(phoneIdx), website: cell(webIdx) });
    });
    return rows;
  }
}
