import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { IndexSourceInput, IEmbeddingService, IVectorStoreService } from '../types/index.js';
import { GitHubService } from '../services/GitHubService.js';
import { WebScrapingService } from '../services/WebScrapingService.js';
import { ContentProcessor } from '../services/ContentProcessor.js';
export declare class IndexSourceTool {
    private githubService;
    private webScrapingService;
    private contentProcessor;
    private embeddingService;
    private vectorStoreService;
    constructor(githubService: GitHubService, webScrapingService: WebScrapingService, contentProcessor: ContentProcessor, embeddingService: IEmbeddingService, vectorStoreService: IVectorStoreService);
    /**
     * Get tool definition for MCP
     */
    getToolDefinition(): Tool;
    /**
     * Execute the indexing operation
     */
    execute(input: IndexSourceInput): Promise<{
        success: boolean;
        message: string;
        sourceId?: string;
        chunksIndexed?: number;
        processingTime?: number;
    }>;
    /**
     * Detect source type from URL
     */
    private detectSourceType;
    /**
     * Generate a source ID for tracking
     */
    private generateSourceId;
    /**
     * Validate URL format
     */
    private validateUrl;
    /**
     * Check if source is already indexed (future enhancement)
     */
    private isSourceIndexed;
    /**
     * Get indexing statistics for a source (future enhancement)
     */
    getIndexingStats(sourceId: string): Promise<{
        sourceId: string;
        url: string;
        indexedAt: Date;
        chunkCount: number;
        lastUpdated: Date;
    } | null>;
    /**
     * Health check for the indexing tool
     */
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=IndexSourceTool.d.ts.map