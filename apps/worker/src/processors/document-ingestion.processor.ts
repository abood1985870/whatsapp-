import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { prisma } from '@qanoai/database';
import { generateEmbeddings } from '@qanoai/ai';

const logger = new Logger('DocumentIngestionProcessor');

// No tokenizer available here, so this approximates the ~500 token/chunk
// target by character count (~4 chars/token) instead.
const MAX_CHARS_PER_CHUNK = 2000;

function chunkText(content: string): string[] {
  const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const source = paragraphs.length ? paragraphs : [content.trim()];
  const chunks: string[] = [];
  let current = '';
  for (const para of source) {
    if (current && current.length + para.length + 2 > MAX_CHARS_PER_CHUNK) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function processDocumentIngestion(job: Job) {
  logger.log(`Processing document ingestion: ${job.id}`);
  const { sourceId, organizationId, knowledgeBaseId } = job.data;

  try {
    // 1. Fetch Source
    const source = await prisma.knowledgeSource.findUnique({
      where: { id: sourceId }
    });

    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }

    // 2. Fetch the Document + its latest version (created when the file was
    // uploaded via the API - this worker chunks/embeds, it doesn't extract)
    const document = await prisma.document.findFirst({
      where: { sourceId },
      orderBy: { createdAt: 'desc' }
    });
    if (!document) {
      throw new Error(`No document record found for source ${sourceId} - nothing to ingest yet`);
    }

    const documentVersion = await prisma.documentVersion.findFirst({
      where: { documentId: document.id },
      orderBy: { version: 'desc' }
    });
    if (!documentVersion?.content) {
      throw new Error(`Document ${document.id} has no extracted content to chunk`);
    }

    // Clear any chunks from a previous run of this version (reprocess/resync)
    await prisma.$executeRaw`DELETE FROM document_chunks WHERE "documentVersionId" = ${documentVersion.id}`;

    // 3. Chunk the real content
    const chunks = chunkText(documentVersion.content);
    if (!chunks.length) {
      throw new Error(`No chunkable content for document ${document.id}`);
    }

    // 4. Generate embeddings and store
    const embeddingResponse = await generateEmbeddings(chunks);

    for (let i = 0; i < chunks.length; i++) {
      const embeddingStr = `[${embeddingResponse.embeddings[i].join(',')}]`;
      const content = chunks[i];
      const contentHash = createHash('sha256').update(content).digest('hex');
      const tokenCount = Math.ceil(content.length / 4);

      await prisma.$executeRaw`
        INSERT INTO document_chunks (
          id, "documentVersionId", "organizationId", "knowledgeBaseId", "sourceId",
          content, "contentHash", "tokenCount", embedding, "createdAt"
        ) VALUES (
          gen_random_uuid(),
          ${documentVersion.id},
          ${organizationId},
          ${knowledgeBaseId},
          ${sourceId},
          ${content},
          ${contentHash},
          ${tokenCount},
          ${embeddingStr}::vector,
          NOW()
        )
      `;
    }

    // 5. Update Source status
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: 'ACTIVE' }
    });

    logger.log(`Document ${document.id} ingested successfully: ${chunks.length} chunks`);
  } catch (error: any) {
    logger.error(`Error ingesting document: ${error.message}`);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: 'FAILED' }
    });
    throw error;
  }
}
