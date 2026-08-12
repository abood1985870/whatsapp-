import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";

/**
 * Media assets are customer attachments — invoices, ID photos, screenshots
 * people send to support. `getFile` and `deleteFile` looked assets up by id
 * alone, so `GET /files/:id/download` handed out any tenant's attachment and
 * `DELETE /files/:id` destroyed it.
 */
@Injectable()
export class FilesService {
  async uploadFile(file: any, organizationId: string): Promise<any> {
    if (!file) throw new BadRequestException("FILE_REQUIRED");

    // Mock S3/MinIO Integration for Phase 1.11
    const uniqueId = generateCorrelationId();
    const ext = file?.originalname?.split(".").pop() || "bin";
    const mediaUrl = `http://localhost:9000/qanoai-uploads/${uniqueId}.${ext}`;

    return prisma.mediaAsset.create({
      data: {
        organizationId,
        storageKey: mediaUrl,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size || 0,
      },
    });
  }

  async getFile(id: string, organizationId: string): Promise<any> {
    const file = await prisma.mediaAsset.findFirst({ where: { id, organizationId } });
    if (!file) throw new NotFoundException("FILE_NOT_FOUND");
    return file;
  }

  async deleteFile(id: string, organizationId: string): Promise<any> {
    // deleteMany, so an id from another organization deletes nothing instead of
    // succeeding.
    const deleted = await prisma.mediaAsset.deleteMany({ where: { id, organizationId } });
    if (deleted.count === 0) throw new NotFoundException("FILE_NOT_FOUND");
    return { success: true };
  }
}
