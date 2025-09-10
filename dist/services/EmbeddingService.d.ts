import { ScoutConfig } from '../types/index.js';
export declare class EmbeddingService {
    private openai;
    private model;
    private batchSize;
    private rateLimitDelay;
    constructor(config: ScoutConfig);
    /**
     * Generate embeddings for a single text
     */
    generateEmbedding(text: string): Promise<number[]>;
    /**
     * Generate embeddings for multiple texts in batches
     */
    generateEmbeddings(texts: string[]): Promise<number[][]>;
    /**
     * Generate embedding for a query (optimized for search)
     */
    generateQueryEmbedding(query: string): Promise<number[]>;
    /**
     * Preprocess text before embedding generation
     */
    private preprocessText;
    /**
     * Preprocess query text for better search results
     */
    private preprocessQuery;
    /**
     * Create batches from an array
     */
    private createBatches;
    /**
     * Calculate cosine similarity between two embeddings
     */
    static cosineSimilarity(a: number[], b: number[]): number;
    /**
     * Health check for the embedding service
     */
    healthCheck(): Promise<boolean>;
    /**
     * Get embedding model information
     */
    getModelInfo(): {
        model: string;
        dimensions: number;
        maxTokens: number;
    };
}
//# sourceMappingURL=EmbeddingService.d.ts.map