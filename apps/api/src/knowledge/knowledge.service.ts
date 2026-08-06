import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import { queues } from "@qanoai/queue";
import { semanticSearch } from "@qanoai/ai";

@Injectable()
export class KnowledgeService {
  async findBases(organizationId: string): Promise<any> { 
    return prisma.knowledgeBase.findMany({ where: { organizationId }, include: { sources: true } }); 
  }
  
  async findBase(id: string): Promise<any> {
    const base = await prisma.knowledgeBase.findUnique({ 
      where: { id }, 
      include: { 
        sources: { 
          include: { 
            documents: true, 
            ingestionJobs: { orderBy: { createdAt: "desc" }, take: 1 } 
          } 
        } 
      } 
    });
    if (!base) throw new NotFoundException("KNOWLEDGE_BASE_NOT_FOUND");
    return base;
  }
  
  async createBase(data: any): Promise<any> { 
    return prisma.knowledgeBase.create({ 
      data: { 
        organizationId: data.organizationId, 
        name: data.name, 
        description: data.description, 
        isDefault: data.isDefault || false 
      } 
    }); 
  }
  
  async createSource(data: any): Promise<any> { 
    return prisma.knowledgeSource.create({ 
      data: { 
        knowledgeBaseId: data.knowledgeBaseId, 
        name: data.name, 
        sourceType: data.sourceType, 
        sourceUrl: data.sourceUrl, 
        filePath: data.filePath, 
        mimeType: data.mimeType, 
        status: "UPLOADED" 
      } 
    }); 
  }
  
  async findFaq(organizationId: string): Promise<any> { 
    return prisma.faqEntry.findMany({ where: { organizationId, isActive: true }, orderBy: { createdAt: "desc" } }); 
  }
  
  async createFaq(data: any): Promise<any> { 
    return prisma.faqEntry.create({ 
      data: { 
        organizationId: data.organizationId, 
        question: data.question, 
        answer: data.answer, 
        category: data.category, 
        language: data.language || "ar" 
      } 
    }); 
  }

  async syncBase(id: string): Promise<any> {
    const base = await prisma.knowledgeBase.findUnique({ where: { id }, include: { sources: true } });
    if (!base) throw new NotFoundException("KNOWLEDGE_BASE_NOT_FOUND");

    // For each source, create a pending ingestion job and actually enqueue it
    for (const source of base.sources) {
      await prisma.ingestionJob.create({
        data: {
          sourceId: source.id,
          status: "QUEUED",
          stage: "PENDING",
          progress: 0
        }
      });
      await prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: "PROCESSING" }
      });
      await queues.documentIngestion.add("process-source", {
        sourceId: source.id,
        organizationId: base.organizationId,
        knowledgeBaseId: base.id
      });
    }
    return { success: true, message: "Sync started" };
  }

  async getBaseStats(id: string): Promise<any> {
    const base = await prisma.knowledgeBase.findUnique({ where: { id }, include: { sources: { include: { documents: { include: { versions: { include: { chunks: true } } } } } } } });
    if (!base) throw new NotFoundException("KNOWLEDGE_BASE_NOT_FOUND");
    
    let totalDocuments = 0;
    let totalChunks = 0;
    
    for (const source of base.sources) {
      totalDocuments += source.documents.length;
      for (const doc of source.documents) {
        for (const v of doc.versions) {
          totalChunks += v.chunks.length;
        }
      }
    }
    
    return {
      totalSources: base.sources.length,
      totalDocuments,
      totalChunks
    };
  }

  async uploadDocument(baseId: string, dto: any): Promise<any> {
    const base = await prisma.knowledgeBase.findUnique({ where: { id: baseId } });
    if (!base) throw new NotFoundException("KNOWLEDGE_BASE_NOT_FOUND");
    if (!dto.content?.trim()) {
      // Binary file upload/extraction (PDF/DOCX) isn't wired up yet - only
      // plain-text content can be ingested for now. Reject rather than
      // silently embedding a fake placeholder into the knowledge base.
      throw new BadRequestException("CONTENT_REQUIRED");
    }

    const source = await prisma.knowledgeSource.create({
      data: {
        knowledgeBaseId: baseId,
        name: dto.name,
        sourceType: "FILE",
        filePath: dto.filePath,
        mimeType: dto.mimeType || "text/plain",
        status: "PROCESSING"
      }
    });

    const doc = await prisma.document.create({
      data: {
        sourceId: source.id,
        name: dto.name || "Untitled"
      }
    });

    const version = await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        content: dto.content
      }
    });

    await prisma.ingestionJob.create({
      data: {
        sourceId: source.id,
        status: "QUEUED",
        stage: "PENDING",
        progress: 0
      }
    });
    await queues.documentIngestion.add("process-source", {
      sourceId: source.id,
      organizationId: base.organizationId,
      knowledgeBaseId: base.id
    });

    return doc;
  }

  async deleteDocument(id: string): Promise<any> {
    const doc = await prisma.document.findUnique({ where: { id }, include: { versions: { include: { chunks: true } } } });
    if (!doc) throw new NotFoundException("DOCUMENT_NOT_FOUND");
    
    // In Phase 1 we can soft delete or hard delete, schema doesn't have deletedAt for Document
    await prisma.document.delete({ where: { id } });
    return { success: true };
  }

  async reprocessDocument(id: string): Promise<any> {
    const doc = await prisma.document.findUnique({ where: { id }, include: { source: { include: { knowledgeBase: true } } } });
    if (!doc) throw new NotFoundException("DOCUMENT_NOT_FOUND");

    await prisma.ingestionJob.create({
      data: {
        sourceId: doc.sourceId,
        status: "QUEUED",
        stage: "PENDING",
        progress: 0
      }
    });

    await prisma.knowledgeSource.update({
      where: { id: doc.sourceId },
      data: { status: "PROCESSING" }
    });

    await queues.documentIngestion.add("process-source", {
      sourceId: doc.sourceId,
      organizationId: doc.source.knowledgeBase.organizationId,
      knowledgeBaseId: doc.source.knowledgeBaseId
    });

    return { success: true };
  }

  async search(organizationId: string, query: string, baseId?: string): Promise<any> {
    const results = await semanticSearch(organizationId, query, baseId, 5);
    return {
      query,
      results: results.map((r) => ({
        chunkId: r.chunkId,
        content: r.content,
        score: r.score,
        metadata: r.metadata
      }))
    };
  }

  async listCategories(organizationId: string): Promise<any> {
    return prisma.knowledgeCategory.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  }

  async createCategory(data: any): Promise<any> {
    return prisma.knowledgeCategory.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        description: data.description
      }
    });
  }
}
