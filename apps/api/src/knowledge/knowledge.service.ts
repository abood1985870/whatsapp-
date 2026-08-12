import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import { queues } from "@qanoai/queue";
import { semanticSearch } from "@qanoai/ai";

@Injectable()
export class KnowledgeService {
  /**
   * The knowledge base is the tenant's own business content — price lists,
   * policies, contracts, internal FAQs — and it is also what the AI answers
   * customers from. Reading another tenant's base leaks their commercial
   * terms; writing to it changes what their AI tells their customers.
   *
   * Both ends were addressable by id alone. These helpers prove ownership
   * first; a document is checked by walking source -> knowledgeBase, since
   * Document itself carries no organizationId.
   */
  private async assertBaseOwned(id: string, organizationId: string) {
    const base = await prisma.knowledgeBase.findFirst({
      where: { id, organizationId },
      select: { id: true, organizationId: true },
    });
    if (!base) throw new NotFoundException("KNOWLEDGE_BASE_NOT_FOUND");
    return base;
  }

  private async assertDocumentOwned(id: string, organizationId: string) {
    const doc = await prisma.document.findFirst({
      where: { id, source: { knowledgeBase: { organizationId } } },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException("DOCUMENT_NOT_FOUND");
    return doc;
  }

  async findBases(organizationId: string): Promise<any> { 
    return prisma.knowledgeBase.findMany({ where: { organizationId }, include: { sources: true } }); 
  }
  
  async findBase(id: string, organizationId: string): Promise<any> {
    await this.assertBaseOwned(id, organizationId);
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
    // knowledgeBaseId comes from the request body; without this check a caller
    // could attach a source — and therefore content the AI answers from — to
    // another organization's knowledge base.
    await this.assertBaseOwned(data.knowledgeBaseId, data.organizationId); 
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

  /**
   * Answers the AI learned from a support reply, waiting for a human to say yes.
   *
   * Auto-learned entries used to be written live, so one reply from the support
   * phone silently became something the AI would repeat to every future customer
   * who asked something similar. They are now inactive on creation, which means
   * there has to be somewhere to see and approve them — this is it.
   */
  async findPendingFaq(organizationId: string): Promise<any> {
    return prisma.faqEntry.findMany({
      where: { organizationId, isActive: false, category: "Auto-learned" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async approveFaq(id: string, organizationId: string): Promise<any> {
    const approved = await prisma.faqEntry.updateMany({
      where: { id, organizationId, isActive: false },
      data: { isActive: true },
    });
    if (approved.count === 0) throw new NotFoundException("FAQ_NOT_FOUND");
    return { success: true };
  }

  async rejectFaq(id: string, organizationId: string): Promise<any> {
    const removed = await prisma.faqEntry.deleteMany({
      where: { id, organizationId, isActive: false },
    });
    if (removed.count === 0) throw new NotFoundException("FAQ_NOT_FOUND");
    return { success: true };
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

  async syncBase(id: string, organizationId: string): Promise<any> {
    await this.assertBaseOwned(id, organizationId);
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

  async getBaseStats(id: string, organizationId: string): Promise<any> {
    await this.assertBaseOwned(id, organizationId);
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

  async uploadDocument(baseId: string, organizationId: string, dto: any): Promise<any> {
    await this.assertBaseOwned(baseId, organizationId);
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

  async deleteDocument(id: string, organizationId: string): Promise<any> {
    await this.assertDocumentOwned(id, organizationId);
    const doc = await prisma.document.findUnique({ where: { id }, include: { versions: { include: { chunks: true } } } });
    if (!doc) throw new NotFoundException("DOCUMENT_NOT_FOUND");
    
    // In Phase 1 we can soft delete or hard delete, schema doesn't have deletedAt for Document
    await prisma.document.delete({ where: { id } });
    return { success: true };
  }

  async reprocessDocument(id: string, organizationId: string): Promise<any> {
    await this.assertDocumentOwned(id, organizationId);
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
