import { Pinecone } from '@pinecone-database/pinecone';
import { VectorStoreError } from '../types/index.js';
export class VectorStoreService {
    pinecone;
    indexName;
    batchSize;
    constructor(config) {
        this.pinecone = new Pinecone({
            apiKey: config.pinecone.apiKey
        });
        this.indexName = config.pinecone.indexName;
        this.batchSize = config.processing.batchSize;
    }
    /**
     * Initialize the Pinecone index if it doesn't exist
     */
    async initialize() {
        try {
            // Check if index exists
            const existingIndexes = await this.pinecone.listIndexes();
            const indexExists = existingIndexes.indexes?.some(idx => idx.name === this.indexName);
            if (!indexExists) {
                // Create index with 1536 dimensions for text-embedding-3-small
                await this.pinecone.createIndex({
                    name: this.indexName,
                    dimension: 1536,
                    metric: 'cosine',
                    spec: {
                        serverless: {
                            cloud: 'aws',
                            region: 'us-east-1'
                        }
                    }
                });
                // Wait for index to be ready
                await this.waitForIndexReady();
            }
        }
        catch (error) {
            throw new VectorStoreError(`Failed to initialize Pinecone index: ${error instanceof Error ? error.message : 'Unknown error'}`, { indexName: this.indexName, error });
        }
    }
    /**
     * Wait for index to be ready for operations
     */
    async waitForIndexReady(maxWaitTime = 60000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitTime) {
            try {
                const indexStats = await this.pinecone.index(this.indexName).describeIndexStats();
                if (indexStats) {
                    return; // Index is ready
                }
            }
            catch (error) {
                // Continue waiting
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        throw new VectorStoreError('Index failed to become ready within timeout period');
    }
    /**
     * Upsert vectors to Pinecone in batches with retry logic
     */
    async upsertVectors(vectors) {
        if (vectors.length === 0)
            return;
        const index = this.pinecone.index(this.indexName);
        const batches = this.createBatches(vectors, this.batchSize);
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            let retryCount = 0;
            const maxRetries = 3;
            while (retryCount < maxRetries) {
                try {
                    await index.upsert(batch);
                    console.log(`Upserted batch ${i + 1}/${batches.length} (${batch.length} vectors)`);
                    break; // Success
                }
                catch (error) {
                    retryCount++;
                    if (retryCount >= maxRetries) {
                        throw new VectorStoreError(`Failed to upsert batch ${i + 1} after ${maxRetries} retries: ${error instanceof Error ? error.message : 'Unknown error'}`, { batchIndex: i, batchSize: batch.length, error });
                    }
                    // Exponential backoff
                    const delay = Math.pow(2, retryCount) * 1000;
                    console.warn(`Batch ${i + 1} failed, retrying in ${delay}ms... (attempt ${retryCount}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
    }
    /**
     * Query vectors using similarity search
     */
    async queryVectors(vector, options = {}) {
        const { topK = 10, filter, threshold = 0.7, includeMetadata = true } = options;
        try {
            const index = this.pinecone.index(this.indexName);
            const queryResponse = await index.query({
                vector,
                topK,
                filter,
                includeMetadata
            });
            const results = [];
            if (queryResponse.matches) {
                for (const match of queryResponse.matches) {
                    if (match.score && match.score >= threshold) {
                        results.push({
                            id: match.id,
                            score: match.score,
                            metadata: match.metadata
                        });
                    }
                }
            }
            return results.sort((a, b) => b.score - a.score);
        }
        catch (error) {
            throw new VectorStoreError(`Failed to query vectors: ${error instanceof Error ? error.message : 'Unknown error'}`, { topK, filter, threshold, error });
        }
    }
    /**
     * Delete vectors by IDs
     */
    async deleteVectors(ids) {
        if (ids.length === 0)
            return;
        try {
            const index = this.pinecone.index(this.indexName);
            const batches = this.createBatches(ids, this.batchSize);
            for (const batch of batches) {
                await index.deleteMany(batch);
            }
        }
        catch (error) {
            throw new VectorStoreError(`Failed to delete vectors: ${error instanceof Error ? error.message : 'Unknown error'}`, { ids, error });
        }
    }
    /**
     * Delete all vectors matching a filter (e.g., by sourceUrl)
     */
    async deleteByFilter(filter) {
        try {
            const index = this.pinecone.index(this.indexName);
            await index.deleteMany(filter);
        }
        catch (error) {
            throw new VectorStoreError(`Failed to delete vectors by filter: ${error instanceof Error ? error.message : 'Unknown error'}`, { filter, error });
        }
    }
    /**
     * Get index statistics
     */
    async getIndexStats() {
        try {
            const index = this.pinecone.index(this.indexName);
            const stats = await index.describeIndexStats();
            return {
                totalVectors: stats.totalRecordCount || 0,
                dimension: stats.dimension || 0,
                indexFullness: stats.indexFullness || 0
            };
        }
        catch (error) {
            throw new VectorStoreError(`Failed to get index stats: ${error instanceof Error ? error.message : 'Unknown error'}`, { indexName: this.indexName, error });
        }
    }
    /**
     * List all unique source URLs in the index
     */
    async listSources() {
        try {
            // Since Pinecone doesn't support listing all vectors directly,
            // we'll need to maintain a separate tracking mechanism
            // For now, return an empty array - this would need to be implemented
            // with a separate metadata store or by querying with broad filters
            console.warn('listSources() not fully implemented - requires metadata tracking');
            return [];
        }
        catch (error) {
            throw new VectorStoreError(`Failed to list sources: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
        }
    }
    /**
     * Create batches from an array
     */
    createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }
    /**
     * Generate a unique vector ID based on content
     */
    static async generateVectorId(sourceUrl, chunkHash) {
        const crypto = await import('crypto');
        return crypto.createHash('sha256')
            .update(`${sourceUrl}:${chunkHash}`)
            .digest('hex');
    }
    /**
     * Health check for the vector store connection
     */
    async healthCheck() {
        try {
            const stats = await this.getIndexStats();
            return true;
        }
        catch (error) {
            console.error('Vector store health check failed:', error);
            return false;
        }
    }
}
//# sourceMappingURL=VectorStoreService.js.map