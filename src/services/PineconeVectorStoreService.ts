import { Pinecone } from '@pinecone-database/pinecone';
import { IVectorStoreService, QueryResult, Vector, VectorStoreError } from '../types/index.js';

export class PineconeVectorStoreService implements IVectorStoreService {
  private client: Pinecone;
  private indexName: string;
  private namespace: string;

  constructor() {
    const apiKey = process.env.PINECONE_API_KEY;
    const index = process.env.PINECONE_INDEX;
    if (!apiKey || !index) {
      throw new VectorStoreError('PINECONE_API_KEY and PINECONE_INDEX are required');
    }
    this.client = new Pinecone({ apiKey });
    this.indexName = index;
    this.namespace = process.env.PINECONE_NAMESPACE || 'documents';
  }

  async initialize(): Promise<void> {
    // no-op; existence is validated in constructor
  }

  async upsertVectors(vectors: Vector[]): Promise<void> {
    if (vectors.length === 0) return;
    const index = this.client.index(this.indexName).namespace(this.namespace);
    await index.upsert(
      vectors.map(v => ({ id: v.id, values: v.values, metadata: v.metadata })) as any
    );
  }

  async queryVectors(vector: number[], options: { topK?: number; filter?: Record<string, any>; threshold?: number; includeMetadata?: boolean } = {}): Promise<QueryResult[]> {
    const index = this.client.index(this.indexName).namespace(this.namespace);
    const res = await index.query({
      vector,
      topK: options.topK ?? 10,
      filter: options.filter,
      includeMetadata: true,
      includeValues: false
    });
    const threshold = options.threshold ?? 0.7;
    const matches = res.matches || [];
    return (matches as any[])
      .filter((m: any) => (m.score ?? 0) >= threshold)
      .map((m: any) => ({ id: m.id as string, score: m.score as number, metadata: (m.metadata as any) }))
      .sort((a: any, b: any) => (b.score as number) - (a.score as number));
  }

  async deleteVectors(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const index = this.client.index(this.indexName).namespace(this.namespace);
    await index.deleteMany(ids);
  }

  async deleteByFilter(filter: Record<string, any>): Promise<void> {
    const idx = this.client.index(this.indexName)
    const stats = await idx.describeIndexStats()
    const dim = stats.dimension || 1536
    const zero = Array.from({ length: dim }, () => 0)
    const index = idx.namespace(this.namespace)

    // Best-effort: page through and delete by IDs using filtered queries
    // Note: topK capped by service; loop until no matches are returned
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await index.query({
        vector: zero as number[],
        topK: 200,
        filter: filter as any,
        includeMetadata: false,
        includeValues: false
      })
      const ids = (res.matches || []).map((m: any) => m.id as string)
      if (!ids.length) break
      await index.deleteMany(ids)
      if (ids.length < 200) break
    }
  }

  async getIndexStats(): Promise<{ totalVectors: number; dimension: number; indexFullness: number }> {
    const idx = this.client.index(this.indexName);
    const s = await idx.describeIndexStats();
    const ns = (s as any).namespaces?.[this.namespace];
    return { totalVectors: (ns?.recordCount as number) || 0, dimension: s.dimension || 1536, indexFullness: 0 };
  }

  async listSources(): Promise<string[]> {
    // Not supported directly; use SourceRegistryService externally
    return [];
  }

  async healthCheck(): Promise<boolean> {
    try { await this.getIndexStats(); return true } catch { return false }
  }

  // OSS mode has no document dashboard; keep API compatible
  async createDocument(): Promise<{ id: string }> { return { id: '' }; }
  async updateDocument(): Promise<void> { /* noop */ }
}


