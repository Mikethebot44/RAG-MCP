import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { DeleteSourceInput, IVectorStoreService } from '../types/index.js';
import { ListSourcesTool } from './ListSourcesTool.js';
export declare class DeleteSourceTool {
    private vectorStoreService;
    private listSourcesTool;
    constructor(vectorStoreService: IVectorStoreService, listSourcesTool: ListSourcesTool);
    /**
     * Get tool definition for MCP
     */
    getToolDefinition(): Tool;
    /**
     * Execute the delete source operation
     */
    execute(input: DeleteSourceInput): Promise<{
        success: boolean;
        message: string;
        deletedChunks?: number;
        sourceUrl?: string;
        deletionTime?: number;
    }>;
    /**
     * Delete source by URL
     */
    private deleteSourceByUrl;
    /**
     * Find source by ID
     */
    private findSourceById;
    /**
     * Find source by URL (in case user provided URL instead of ID)
     */
    private findSourceByUrl;
    /**
     * Normalize URL for consistent comparison
     */
    private normalizeUrl;
    /**
     * Delete multiple sources by IDs
     */
    deleteMultipleSources(sourceIds: string[]): Promise<{
        success: boolean;
        message: string;
        results: Array<{
            sourceId: string;
            success: boolean;
            message: string;
            deletedChunks?: number;
        }>;
        totalDeleted: number;
    }>;
    /**
     * Delete all sources (dangerous operation)
     */
    deleteAllSources(confirmationPhrase: string): Promise<{
        success: boolean;
        message: string;
        deletedSources?: number;
        deletedChunks?: number;
    }>;
    /**
     * Preview what would be deleted (dry run)
     */
    previewDeletion(sourceId: string): Promise<{
        success: boolean;
        message: string;
        sourceInfo?: {
            id: string;
            url: string;
            title: string;
            chunkCount: number;
        };
    }>;
    /**
     * Health check for the delete source tool
     */
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=DeleteSourceTool.d.ts.map