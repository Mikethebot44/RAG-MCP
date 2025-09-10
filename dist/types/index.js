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
    onlyMainContent: z.boolean().optional().default(true).describe('Extract only main content for documentation')
});
export const SearchContextInputSchema = z.object({
    query: z.string().describe('Search query for finding relevant context'),
    maxResults: z.number().optional().default(10).describe('Maximum number of results to return'),
    sources: z.array(z.string()).optional().describe('Filter by specific source URLs/IDs'),
    includeCode: z.boolean().optional().default(true).describe('Include code snippets in results'),
    includeDoc: z.boolean().optional().default(true).describe('Include documentation in results'),
    threshold: z.number().min(0).max(1).optional().default(0.7).describe('Similarity threshold for results')
});
export const DeleteSourceInputSchema = z.object({
    sourceId: z.string().describe('ID of the source to delete from vector store')
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