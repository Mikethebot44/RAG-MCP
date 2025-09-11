import { z } from 'zod';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { 
  SearchContextInputSchema,
  SearchContextInput,
  SearchResult,
  QueryResult,
  IEmbeddingService,
  IVectorStoreService
} from '../types/index.js';

export class SearchContextTool {
  private embeddingService: IEmbeddingService;
  private vectorStoreService: IVectorStoreService;

  constructor(
    embeddingService: IEmbeddingService,
    vectorStoreService: IVectorStoreService
  ) {
    this.embeddingService = embeddingService;
    this.vectorStoreService = vectorStoreService;
  }

  /**
   * Get tool definition for MCP
   */
  getToolDefinition(): Tool {
    return {
      name: 'search_context',
      description: 'Search indexed sources for relevant context based on a query. Returns ranked results with source attribution.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for finding relevant context'
          },
          maxResults: {
            type: 'number',
            default: 10,
            description: 'Maximum number of results to return'
          },
          sources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by specific source URLs/IDs'
          },
          includeCode: {
            type: 'boolean',
            default: true,
            description: 'Include code snippets in results'
          },
          includeDoc: {
            type: 'boolean',
            default: true,
            description: 'Include documentation in results'
          },
          threshold: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            default: 0.7,
            description: 'Similarity threshold for results'
          }
        },
        required: ['query']
      }
    };
  }

  /**
   * Execute the search operation
   */
  async execute(input: SearchContextInput): Promise<{
    success: boolean;
    message: string;
    results?: SearchResult[];
    totalResults?: number;
    searchTime?: number;
  }> {
    const startTime = Date.now();

    try {
      console.log(`Searching for: "${input.query}"`);

      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateQueryEmbedding(input.query);

      // Build filter for vector search
      const filter = this.buildSearchFilter(input);

      // Perform vector similarity search
      const vectorResults = await this.vectorStoreService.queryVectors(queryEmbedding, {
        topK: input.maxResults || 10,
        threshold: input.threshold || 0.7,
        filter,
        includeMetadata: true
      });

      // Convert vector results to search results
      const searchResults = this.convertToSearchResults(vectorResults, input);

      // Re-rank results by relevance and diversify
      const rankedResults = this.rankAndDiversifyResults(searchResults, input.query);

      const searchTime = Date.now() - startTime;

      if (rankedResults.length === 0) {
        return {
          success: true,
          message: 'No relevant results found. Try adjusting your query or lowering the similarity threshold.',
          results: [],
          totalResults: 0,
          searchTime
        };
      }

      return {
        success: true,
        message: `Found ${rankedResults.length} relevant results`,
        results: rankedResults,
        totalResults: rankedResults.length,
        searchTime
      };

    } catch (error) {
      console.error('Error searching context:', error);
      
      const searchTime = Date.now() - startTime;
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unknown error occurred during search';

      return {
        success: false,
        message: `Search failed: ${errorMessage}`,
        searchTime
      };
    }
  }

  /**
   * Build search filter based on input parameters
   */
  private buildSearchFilter(input: SearchContextInput): Record<string, any> {
    const filter: Record<string, any> = {};

    // Filter by source URLs if specified
    if (input.sources && input.sources.length > 0) {
      filter.sourceUrl = { $in: input.sources };
    }

    // Filter by content type
    const includeTypes: string[] = [];
    if (input.includeCode !== false) {
      includeTypes.push('code', 'readme');
    }
    if (input.includeDoc !== false) {
      includeTypes.push('documentation');
    }
    
    if (includeTypes.length > 0) {
      filter.type = { $in: includeTypes };
    }

    return filter;
  }

  /**
   * Convert vector results to search results
   */
  private convertToSearchResults(vectorResults: QueryResult[], input: SearchContextInput): SearchResult[] {
    return vectorResults.map(result => ({
      content: result.metadata.content,
      source: {
        url: result.metadata.sourceUrl,
        type: result.metadata.type === 'code' || result.metadata.type === 'readme' ? 'github' : 'documentation',
        path: result.metadata.sourcePath,
        title: result.metadata.sourceTitle
      },
      metadata: {
        language: result.metadata.language,
        section: result.metadata.section,
        headingLevel: result.metadata.headingLevel
      },
      score: result.score
    }));
  }

  /**
   * Rank and diversify search results
   */
  private rankAndDiversifyResults(results: SearchResult[], query: string): SearchResult[] {
    // Apply additional scoring factors
    const scoredResults = results.map(result => ({
      ...result,
      adjustedScore: this.calculateAdjustedScore(result, query)
    }));

    // Sort by adjusted score
    scoredResults.sort((a, b) => b.adjustedScore - a.adjustedScore);

    // Diversify results to avoid too many from the same source
    const diversifiedResults = this.diversifyResults(scoredResults);

    return diversifiedResults.map(result => ({
      content: result.content,
      source: result.source,
      metadata: result.metadata,
      score: result.score
    }));
  }

  /**
   * Calculate adjusted score with additional factors
   */
  private calculateAdjustedScore(result: SearchResult, query: string): number {
    let score = result.score;

    // Boost score based on content length (prefer more substantial content)
    const contentLength = result.content.length;
    if (contentLength > 500) {
      score *= 1.1;
    } else if (contentLength < 100) {
      score *= 0.9;
    }

    // Boost score for code if query contains code-related terms
    const codeTerms = ['function', 'class', 'method', 'implementation', 'code', 'api', 'library'];
    const hasCodeTerms = codeTerms.some(term => 
      query.toLowerCase().includes(term) || result.content.toLowerCase().includes(term)
    );
    
    if (hasCodeTerms && result.source.type === 'github') {
      score *= 1.2;
    }

    // Boost score for documentation if query contains question words
    const questionWords = ['how', 'what', 'why', 'when', 'where', 'guide', 'tutorial', 'documentation'];
    const hasQuestionWords = questionWords.some(word => query.toLowerCase().includes(word));
    
    if (hasQuestionWords && result.source.type === 'documentation') {
      score *= 1.15;
    }

    // Boost score for exact phrase matches
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentLower = result.content.toLowerCase();
    const exactMatches = queryWords.filter(word => contentLower.includes(word)).length;
    const exactMatchBoost = 1 + (exactMatches / queryWords.length) * 0.1;
    score *= exactMatchBoost;

    // Prefer content with clear structure (headers, sections)
    if (result.metadata.section) {
      score *= 1.05;
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Diversify results to include variety of sources
   */
  private diversifyResults(results: SearchResult[]): SearchResult[] {
    const diversified: SearchResult[] = [];
    const sourceCount: Record<string, number> = {};
    const maxPerSource = 3; // Maximum results per source

    for (const result of results) {
      const sourceKey = result.source.url;
      const currentCount = sourceCount[sourceKey] || 0;

      if (currentCount < maxPerSource) {
        diversified.push(result);
        sourceCount[sourceKey] = currentCount + 1;
      }
    }

    // If we have fewer results than requested due to diversification,
    // add more from the highest-scoring sources
    if (diversified.length < results.length && diversified.length < 10) {
      const remaining = results.filter(r => !diversified.includes(r));
      const additionalCount = Math.min(remaining.length, 10 - diversified.length);
      diversified.push(...remaining.slice(0, additionalCount));
    }

    return diversified;
  }

  /**
   * Format search results for display
   */
  formatResultsForDisplay(results: SearchResult[]): string {
    if (results.length === 0) {
      return 'No results found.';
    }

    const formattedResults = results.map((result, index) => {
      const sourceInfo = result.source.path 
        ? `${result.source.url}/${result.source.path}`
        : result.source.url;
      
      const metadata = [];
      if (result.metadata.language) metadata.push(`Language: ${result.metadata.language}`);
      if (result.metadata.section) metadata.push(`Section: ${result.metadata.section}`);
      
      const metadataStr = metadata.length > 0 ? ` (${metadata.join(', ')})` : '';
      const score = (result.score * 100).toFixed(1);

      // Truncate content if too long
      const maxContentLength = 500;
      let content = result.content;
      if (content.length > maxContentLength) {
        content = content.substring(0, maxContentLength) + '...';
      }

      return `## Result ${index + 1} (${score}% match)
**Source:** ${sourceInfo}${metadataStr}

${content}

---`;
    });

    return formattedResults.join('\n\n');
  }

  /**
   * Get search suggestions based on indexed content
   */
  async getSearchSuggestions(partialQuery: string): Promise<string[]> {
    // This would require maintaining an index of common terms
    // For now, return some basic suggestions
    const basicSuggestions = [
      'how to implement',
      'API documentation',
      'configuration guide',
      'troubleshooting',
      'best practices',
      'getting started',
      'examples',
      'tutorial'
    ];

    return basicSuggestions.filter(suggestion => 
      suggestion.toLowerCase().includes(partialQuery.toLowerCase())
    );
  }

  /**
   * Health check for the search tool
   */
  async healthCheck(): Promise<boolean> {
    try {
      const checks = await Promise.all([
        this.embeddingService.healthCheck(),
        this.vectorStoreService.healthCheck()
      ]);

      return checks.every(check => check === true);
    } catch (error) {
      console.error('Search context tool health check failed:', error);
      return false;
    }
  }
}