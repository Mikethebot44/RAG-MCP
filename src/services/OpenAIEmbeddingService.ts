import OpenAI from 'openai';
import { EmbeddingError, IEmbeddingService } from '../types/index.js';

export class OpenAIEmbeddingService implements IEmbeddingService {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new EmbeddingError('OPENAI_API_KEY is required');
    }
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const res = await this.client.embeddings.create({ model: this.model, input: text });
      return (res.data[0].embedding as unknown) as number[];
    } catch (e) {
      throw new EmbeddingError(`OpenAI embedding failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const res = await this.client.embeddings.create({ model: this.model, input: texts });
      return res.data.map((d: any) => (d.embedding as unknown) as number[]);
    } catch (e) {
      throw new EmbeddingError(`OpenAI embeddings failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  async generateQueryEmbedding(query: string): Promise<number[]> {
    return this.generateEmbedding(query);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.generateEmbedding('ok');
      return true;
    } catch {
      return false;
    }
  }

  getModelInfo(): { model: string; dimensions: number; maxTokens: number } {
    // Known dimensions for text-embedding-3-small
    const dims = this.model === 'text-embedding-3-large' ? 3072 : 1536;
    return { model: this.model, dimensions: dims, maxTokens: 8191 };
  }
}


