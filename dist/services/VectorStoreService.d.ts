import { Vector, QueryResult, OpenRAGConfig } from '../types/index.js';
export declare class VectorStoreService {
    private pinecone;
    private indexName;
    private batchSize;
    constructor(config: OpenRAGConfig);
    /**
     * Initialize the Pinecone index if it doesn't exist
     */
    initialize(): Promise<void>;
    /**
     * Wait for index to be ready for operations
     */
    private waitForIndexReady;
    /**
     * Upsert vectors to Pinecone in batches with retry logic
     */
    upsertVectors(vectors: Vector[]): Promise<void>;
    /**
     * Query vectors using similarity search
     */
    queryVectors(vector: number[], options?: {
        topK?: number;
        filter?: Record<string, any>;
        threshold?: number;
        includeMetadata?: boolean;
    }): Promise<QueryResult[]>;
    /**
     * Delete vectors by IDs
     */
    deleteVectors(ids: string[]): Promise<void>;
    /**
     * Delete all vectors matching a filter (e.g., by sourceUrl)
     */
    deleteByFilter(filter: Record<string, any>): Promise<void>;
    /**
     * Get index statistics
     */
    getIndexStats(): Promise<{
        totalVectors: number;
        dimension: number;
        indexFullness: number;
    }>;
    /**
     * List all unique source URLs in the index
     */
    listSources(): Promise<string[]>;
    /**
     * Create batches from an array
     */
    private createBatches;
    /**
     * Generate a unique vector ID based on content
     */
    static generateVectorId(sourceUrl: string, chunkHash: string): Promise<string>;
    /**
     * Health check for the vector store connection
     */
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=VectorStoreService.d.ts.map