import { z } from 'zod';
// MCP Tool input schemas (Zod schemas for validation)
export const IndexSourceInputSchema = z.object({
    url: z.string().url().describe('GitHub repository URL or documentation URL'),
    sourceType: z.enum(['auto', 'github', 'documentation']).optional().default('auto').describe('Source type (auto-detect by default)'),
    branch: z.string().optional().default('main').describe('Git branch for GitHub repos'),
    includePatterns: z.array(z.string()).optional().describe('File patterns to include (e.g., ["*.ts", "*.js"])'),
    excludePatterns: z.array(z.string()).optional().describe('File patterns to exclude (e.g., ["node_modules/**"])'),
    maxFileSize: z.number().optional().default(1048576).describe('Maximum file size in bytes'),
    maxDepth: z.number().optional().default(3).describe('Maximum crawl depth for documentation'),
    onlyMainContent: z.boolean().optional().default(true).describe('Extract only main content for documentation'),
    tokensPerChunk: z.number().optional().describe('Approximate tokens per chunk to re-chunk text after scraping (4 chars ≈ 1 token)'),
    scrapingBackend: z.enum(['playwright', 'firecrawl']).optional().default('playwright').describe('Scraping backend for documentation')
});
export const SearchContextInputSchema = z.object({
    query: z.string().describe('Search query for finding relevant context'),
    maxResults: z.number().optional().default(10).describe('Maximum number of results to return'),
    sources: z.array(z.string()).optional().describe('Filter by specific source URLs/IDs'),
    includeCode: z.boolean().optional().default(true).describe('Include code snippets in results'),
    includeDoc: z.boolean().optional().default(true).describe('Include documentation in results'),
    threshold: z.number().min(0).max(1).optional().default(0.7).describe('Similarity threshold for results'),
    // Tuning knobs for retrieval quality
    minResults: z.number().optional().default(5).describe('Target minimum results before relaxing threshold'),
    oversample: z.number().optional().default(5).describe('Oversampling factor for initial candidates (topK = maxResults * oversample)'),
    strategy: z.enum(['precision', 'balanced', 'recall']).optional().default('balanced').describe('Retrieval bias: precision (higher threshold), recall (lower threshold)'),
    mmrLambda: z.number().min(0).max(1).optional().default(0.5).describe('MMR tradeoff between relevance and diversity (higher = more relevance)'),
    maxPerSource: z.number().optional().default(2).describe('Maximum results per source URL/domain after reranking'),
    dedupe: z.boolean().optional().default(true).describe('Deduplicate near-identical snippets by hash/source/path'),
    lowerThresholdOnFewResults: z.boolean().optional().default(true).describe('Relax threshold adaptively if below minResults'),
    topKCap: z.number().optional().default(100).describe('Hard cap on oversampled topK')
});
export const DeleteSourceInputSchema = z.object({
    sourceId: z.string().describe('ID of the source to delete from vector store')
});
// Firecrawl-backed web search (find sources)
export const FindSourcesInputSchema = z.object({
    query: z.string().describe('Prompt or query to find relevant sources for'),
    limit: z.number().optional().default(10).describe('Maximum number of sources to return'),
    github: z.boolean().optional().default(false).describe('Include GitHub category results'),
    research: z.boolean().optional().default(false).describe('Include Research category results'),
    mainContentOnly: z.boolean().optional().default(true).describe('When indexing later, extract only main content'),
    includeTags: z.array(z.string()).optional().describe('HTML tags or selectors to include during indexing'),
    excludeTags: z.array(z.string()).optional().describe('HTML tags or selectors to exclude during indexing')
});
// Deep research: find sources and index them
export const DeepResearchInputSchema = z.object({
    query: z.string().describe('Prompt or query to research'),
    limit: z.number().optional().default(5).describe('Number of sources to index'),
    github: z.boolean().optional().default(false).describe('Include GitHub category results'),
    research: z.boolean().optional().default(false).describe('Include Research category results'),
    mainContentOnly: z.boolean().optional().default(true).describe('Extract only main content when indexing'),
    includeTags: z.array(z.string()).optional().describe('HTML tags or selectors to include during indexing'),
    excludeTags: z.array(z.string()).optional().describe('HTML tags or selectors to exclude during indexing'),
    scrapingBackend: z.enum(['playwright', 'firecrawl']).optional().default('playwright').describe('Preferred scraping backend for subsequent indexing')
});
// Error types
export class ScoutError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'ScoutError';
    }
}
export class GitHubError extends ScoutError {
    constructor(message, details) {
        super(message, 'GITHUB_ERROR', details);
    }
}
export class VectorStoreError extends ScoutError {
    constructor(message, details) {
        super(message, 'VECTOR_STORE_ERROR', details);
    }
}
export class EmbeddingError extends ScoutError {
    constructor(message, details) {
        super(message, 'EMBEDDING_ERROR', details);
    }
}
//# sourceMappingURL=index.js.map