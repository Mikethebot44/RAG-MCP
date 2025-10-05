import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SourceInfo, IVectorStoreService } from '../types/index.js';
export declare class ListSourcesTool {
    private vectorStoreService;
    private registry;
    private sourceCache;
    private cacheExpiry;
    constructor(vectorStoreService: IVectorStoreService);
    /**
     * Get tool definition for MCP
     */
    getToolDefinition(): Tool;
    /**
     * Execute the list sources operation
     */
    execute(input: {}): Promise<{
        success: boolean;
        message: string;
        sources?: SourceInfo[];
        totalSources?: number;
        totalChunks?: number;
        retrievalTime?: number;
    }>;
    /**
     * Discover sources by sampling vector space
     * Note: This is a workaround since Pinecone doesn't provide direct listing
     */
    private discoverSources;
    /**
     * Generate sample vectors for discovery
     */
    private generateSampleVectors;
    /**
     * Generate random number from normal distribution
     */
    private randomNormal;
    /**
     * Determine source type from metadata
     */
    private determineSourceType;
    /**
     * Extract title from URL
     */
    private extractTitleFromUrl;
    /**
     * Generate source ID
     */
    private generateSourceId;
    /**
     * Format sources for display
     */
    formatSourcesForDisplay(sources: SourceInfo[]): string;
    /**
     * Get source statistics
     */
    getSourceStatistics(): Promise<{
        totalSources: number;
        totalChunks: number;
        sourcesByType: Record<string, number>;
        averageChunksPerSource: number;
    }>;
    /**
     * Check if a source is already indexed
     */
    isSourceIndexed(url: string): Promise<boolean>;
    /**
     * Health check for the list sources tool
     */
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=ListSourcesTool.d.ts.map