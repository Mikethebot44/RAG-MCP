import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SearchContextInput, SearchResult, IEmbeddingService, IVectorStoreService } from '../types/index.js';
export declare class SearchContextTool {
    private embeddingService;
    private vectorStoreService;
    constructor(embeddingService: IEmbeddingService, vectorStoreService: IVectorStoreService);
    /**
     * Get tool definition for MCP
     */
    getToolDefinition(): Tool;
    /**
     * Execute the search operation
     */
    execute(input: SearchContextInput): Promise<{
        success: boolean;
        message: string;
        results?: SearchResult[];
        totalResults?: number;
        searchTime?: number;
    }>;
    /**
     * Build search filter based on input parameters
     */
    private buildSearchFilter;
    /**
     * Convert vector results to search results
     */
    private convertToSearchResults;
    /**
     * Rank and diversify search results
     */
    private rankAndDiversifyResults;
    /**
     * Calculate adjusted score with additional factors
     */
    private calculateAdjustedScore;
    /**
     * Diversify results to include variety of sources
     */
    private diversifyResults;
    /**
     * Format search results for display
     */
    formatResultsForDisplay(results: SearchResult[]): string;
    /**
     * Get search suggestions based on indexed content
     */
    getSearchSuggestions(partialQuery: string): Promise<string[]>;
    /**
     * Health check for the search tool
     */
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=SearchContextTool.d.ts.map