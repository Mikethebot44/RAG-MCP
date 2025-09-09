import { z } from 'zod';
// Input schema for ListSources (no parameters needed)
const ListSourcesInputSchema = z.object({});
export class ListSourcesTool {
    vectorStoreService;
    sourceCache = new Map();
    cacheExpiry = 5 * 60 * 1000; // 5 minutes
    constructor(vectorStoreService) {
        this.vectorStoreService = vectorStoreService;
    }
    /**
     * Get tool definition for MCP
     */
    getToolDefinition() {
        return {
            name: 'list_sources',
            description: 'List all indexed sources in the vector database with their metadata and statistics.',
            inputSchema: {
                type: 'object',
                properties: {}
            }
        };
    }
    /**
     * Execute the list sources operation
     */
    async execute(input) {
        const startTime = Date.now();
        try {
            console.log('Retrieving indexed sources...');
            // Since Pinecone doesn't provide direct access to list all vectors,
            // we need to use alternative approaches to discover sources
            const sources = await this.discoverSources();
            const retrievalTime = Date.now() - startTime;
            if (sources.length === 0) {
                return {
                    success: true,
                    message: 'No sources have been indexed yet.',
                    sources: [],
                    totalSources: 0,
                    totalChunks: 0,
                    retrievalTime
                };
            }
            const totalChunks = sources.reduce((sum, source) => sum + source.chunkCount, 0);
            return {
                success: true,
                message: `Found ${sources.length} indexed sources with ${totalChunks} total chunks`,
                sources: sources.sort((a, b) => new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime()),
                totalSources: sources.length,
                totalChunks,
                retrievalTime
            };
        }
        catch (error) {
            console.error('Error listing sources:', error);
            const retrievalTime = Date.now() - startTime;
            const errorMessage = error instanceof Error
                ? error.message
                : 'Unknown error occurred while listing sources';
            return {
                success: false,
                message: `Failed to list sources: ${errorMessage}`,
                retrievalTime
            };
        }
    }
    /**
     * Discover sources by sampling vector space
     * Note: This is a workaround since Pinecone doesn't provide direct listing
     */
    async discoverSources() {
        const sourceMap = new Map();
        try {
            // Strategy 1: Query with diverse random vectors to discover content
            const sampleVectors = this.generateSampleVectors(10);
            for (const sampleVector of sampleVectors) {
                try {
                    const results = await this.vectorStoreService.queryVectors(sampleVector, {
                        topK: 50, // Get more results to discover sources
                        threshold: 0.0, // Lower threshold to get more diverse results
                        includeMetadata: true
                    });
                    for (const result of results) {
                        const sourceUrl = result.metadata.sourceUrl;
                        if (!sourceMap.has(sourceUrl)) {
                            sourceMap.set(sourceUrl, {
                                url: sourceUrl,
                                type: this.determineSourceType(result.metadata),
                                title: result.metadata.sourceTitle || this.extractTitleFromUrl(sourceUrl),
                                chunks: new Set(),
                                firstSeen: new Date(),
                                lastSeen: new Date()
                            });
                        }
                        const source = sourceMap.get(sourceUrl);
                        source.chunks.add(result.id);
                        source.lastSeen = new Date();
                    }
                }
                catch (error) {
                    // Continue with other sample vectors
                    console.warn('Error sampling with vector:', error);
                }
            }
            // Strategy 2: Try common query terms to discover more content
            const commonTerms = [
                'function', 'class', 'documentation', 'api', 'guide', 'tutorial',
                'installation', 'configuration', 'example', 'usage'
            ];
            // Generate embeddings for common terms (simplified approach)
            // In a production system, you'd cache these or use a different discovery method
        }
        catch (error) {
            console.warn('Error during source discovery:', error);
        }
        // Convert map to SourceInfo array
        const sources = Array.from(sourceMap.entries()).map(([url, data]) => ({
            id: this.generateSourceId(url),
            url: data.url,
            type: data.type,
            title: data.title,
            indexedAt: data.firstSeen.toISOString(),
            chunkCount: data.chunks.size,
            status: 'indexed'
        }));
        return sources;
    }
    /**
     * Generate sample vectors for discovery
     */
    generateSampleVectors(count) {
        const vectors = [];
        const dimensions = 1536; // text-embedding-3-small dimensions
        for (let i = 0; i < count; i++) {
            const vector = Array.from({ length: dimensions }, () => {
                // Generate random values from normal distribution
                return this.randomNormal() * 0.1; // Scale down for realistic embeddings
            });
            // Normalize vector
            const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
            const normalizedVector = vector.map(val => val / norm);
            vectors.push(normalizedVector);
        }
        return vectors;
    }
    /**
     * Generate random number from normal distribution
     */
    randomNormal() {
        // Box-Muller transform
        const u = 0.001 + Math.random() * 0.998; // Avoid log(0)
        const v = 0.001 + Math.random() * 0.998;
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
    /**
     * Determine source type from metadata
     */
    determineSourceType(metadata) {
        if (metadata.sourceUrl?.includes('github.com')) {
            return 'github';
        }
        return 'documentation';
    }
    /**
     * Extract title from URL
     */
    extractTitleFromUrl(url) {
        try {
            const parsedUrl = new URL(url);
            if (parsedUrl.hostname.includes('github.com')) {
                const pathParts = parsedUrl.pathname.split('/').filter(p => p);
                if (pathParts.length >= 2) {
                    return `${pathParts[0]}/${pathParts[1]}`;
                }
            }
            return parsedUrl.hostname;
        }
        catch {
            return 'Unknown Source';
        }
    }
    /**
     * Generate source ID
     */
    generateSourceId(url) {
        const crypto = require('crypto');
        return crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
    }
    /**
     * Format sources for display
     */
    formatSourcesForDisplay(sources) {
        if (sources.length === 0) {
            return 'No sources have been indexed yet.';
        }
        const formatSource = (source, index) => {
            const indexedDate = new Date(source.indexedAt).toLocaleDateString();
            const statusIcon = source.status === 'indexed' ? '✅' : source.status === 'indexing' ? '🔄' : '❌';
            return `## ${index + 1}. ${source.title}
${statusIcon} **Status:** ${source.status}
📊 **Chunks:** ${source.chunkCount}
🔗 **URL:** ${source.url}
📅 **Indexed:** ${indexedDate}
🏷️ **Type:** ${source.type}
📋 **ID:** ${source.id}`;
        };
        const header = `# Indexed Sources (${sources.length} total)\n\n`;
        const sourcesList = sources.map(formatSource).join('\n\n---\n\n');
        const footer = `\n\n**Total chunks across all sources:** ${sources.reduce((sum, s) => sum + s.chunkCount, 0)}`;
        return header + sourcesList + footer;
    }
    /**
     * Get source statistics
     */
    async getSourceStatistics() {
        try {
            const result = await this.execute({});
            if (!result.success || !result.sources) {
                return {
                    totalSources: 0,
                    totalChunks: 0,
                    sourcesByType: {},
                    averageChunksPerSource: 0
                };
            }
            const sourcesByType = {};
            let totalChunks = 0;
            for (const source of result.sources) {
                sourcesByType[source.type] = (sourcesByType[source.type] || 0) + 1;
                totalChunks += source.chunkCount;
            }
            return {
                totalSources: result.sources.length,
                totalChunks,
                sourcesByType,
                averageChunksPerSource: result.sources.length > 0 ? totalChunks / result.sources.length : 0
            };
        }
        catch (error) {
            console.error('Error getting source statistics:', error);
            return {
                totalSources: 0,
                totalChunks: 0,
                sourcesByType: {},
                averageChunksPerSource: 0
            };
        }
    }
    /**
     * Check if a source is already indexed
     */
    async isSourceIndexed(url) {
        try {
            const result = await this.execute({});
            if (!result.success || !result.sources) {
                return false;
            }
            return result.sources.some(source => source.url === url);
        }
        catch (error) {
            console.error('Error checking if source is indexed:', error);
            return false;
        }
    }
    /**
     * Health check for the list sources tool
     */
    async healthCheck() {
        try {
            return await this.vectorStoreService.healthCheck();
        }
        catch (error) {
            console.error('List sources tool health check failed:', error);
            return false;
        }
    }
}
//# sourceMappingURL=ListSourcesTool.js.map