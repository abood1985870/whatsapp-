import { prisma } from '@qanoai/database';
import { generateSingleEmbedding } from './embeddings';

export interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  metadata: any;
}

export async function semanticSearch(
  organizationId: string,
  query: string,
  knowledgeBaseId?: string,
  limit: number = 5
): Promise<SearchResult[]> {
  // Generate embedding for the query
  const embedding = await generateSingleEmbedding(query);
  const embeddingString = `[${embedding.join(',')}]`;

  // Prisma raw query for pgvector cosine distance (<=>)
  // We filter by organizationId and optionally knowledgeBaseId
  
  let results: any[];
  
  if (knowledgeBaseId) {
    results = await prisma.$queryRaw`
      SELECT 
        id, 
        "documentVersionId", 
        content, 
        metadata,
        1 - (embedding <=> ${embeddingString}::vector) as similarity
      FROM document_chunks
      WHERE "organizationId" = ${organizationId} 
        AND "knowledgeBaseId" = ${knowledgeBaseId}
      ORDER BY embedding <=> ${embeddingString}::vector
      LIMIT ${limit}
    `;
  } else {
    results = await prisma.$queryRaw`
      SELECT 
        id, 
        "documentVersionId", 
        content, 
        metadata,
        1 - (embedding <=> ${embeddingString}::vector) as similarity
      FROM document_chunks
      WHERE "organizationId" = ${organizationId}
      ORDER BY embedding <=> ${embeddingString}::vector
      LIMIT ${limit}
    `;
  }

  return results.map(row => ({
    chunkId: row.id,
    documentId: row.documentVersionId, // Simplified for Phase 2
    content: row.content,
    score: row.similarity,
    metadata: row.metadata
  }));
}

export async function getFaqContext(
  organizationId: string,
  query: string,
  agentId?: string,
  limit: number = 3
): Promise<string> {
  // Very basic ILIKE search for FAQs. 
  // In a real production system, this could also be embedded or use full-text search.
  const faqs = await prisma.faqEntry.findMany({
    where: {
      organizationId,
      isActive: true,
      ...(agentId ? { OR: [{ agentId: null }, { agentId }] } : {}),
      AND: [
        {
          OR: [
            { question: { contains: query, mode: 'insensitive' } },
            { answer: { contains: query, mode: 'insensitive' } }
          ]
        }
      ],
    },
    take: limit
  });

  if (faqs.length === 0) return "";

  return faqs.map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
}

export interface AssembledContext {
  context: string;
  citations: SearchResult[];
}

export async function assembleContext(
  organizationId: string,
  query: string,
  knowledgeBaseId?: string,
  agentId?: string
): Promise<AssembledContext> {
  const [semanticResults, faqContext] = await Promise.all([
    semanticSearch(organizationId, query, knowledgeBaseId),
    getFaqContext(organizationId, query, agentId)
  ]);

  let context = "";
  if (faqContext) {
    context += "--- FREQUENTLY ASKED QUESTIONS ---\n" + faqContext + "\n\n";
  }

  if (semanticResults.length > 0) {
    context += "--- KNOWLEDGE BASE ---\n";
    semanticResults.forEach((res, i) => {
      context += `[Source ${i + 1}]: ${res.content}\n\n`;
    });
  }

  return { context, citations: semanticResults };
}
