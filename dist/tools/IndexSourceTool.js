import { ScoutError } from '../types/index.js';
export class IndexSourceTool {
    githubService;
    webScrapingService;
    contentProcessor;
    embeddingService;
    vectorStoreService;
    constructor(githubService, webScrapingService, contentProcessor, embeddingService, vectorStoreService) {
        this.githubService = githubService;
        this.webScrapingService = webScrapingService;
        this.contentProcessor = contentProcessor;
        this.embeddingService = embeddingService;
        this.vectorStoreService = vectorStoreService;
    }
    /**
     * Get tool definition for MCP
     */
    getToolDefinition() {
        return {
            name: 'index_source',
            description: 'Index a source (GitHub repository or documentation website) for RAG search. Supports GitHub repositories and documentation websites.',
            inputSchema: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'GitHub repository URL or documentation URL'
                    },
                    sourceType: {
                        type: 'string',
                        enum: ['auto', 'github', 'documentation'],
                        default: 'auto',
                        description: 'Source type (auto-detect by default)'
                    },
                    branch: {
                        type: 'string',
                        default: 'main',
                        description: 'Git branch for GitHub repos'
                    },
                    includePatterns: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'File patterns to include (e.g., ["*.ts", "*.js"])'
                    },
                    excludePatterns: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'File patterns to exclude (e.g., ["node_modules/**"])'
                    },
                    maxFileSize: {
                        type: 'number',
                        default: 1048576,
                        description: 'Maximum file size in bytes'
                    },
                    maxDepth: {
                        type: 'number',
                        default: 3,
                        description: 'Maximum crawl depth for documentation'
                    },
                    onlyMainContent: {
                        type: 'boolean',
                        default: true,
                        description: 'Extract only main content for documentation'
                    }
                },
                required: ['url']
            }
        };
    }
    /**
     * Execute the indexing operation
     */
    async execute(input) {
        const startTime = Date.now();
        try {
            console.log(`Starting to index source: ${input.url}`);
            // Detect source type
            const sourceType = this.detectSourceType(input.url, input.sourceType);
            console.log(`Detected source type: ${sourceType}`);
            // Process content based on source type
            let chunks;
            let sourceTitle = '';
            if (sourceType === 'github') {
                const githubContent = await this.githubService.processRepository(input.url, {
                    includePatterns: input.includePatterns,
                    excludePatterns: input.excludePatterns,
                    maxFileSize: input.maxFileSize
                });
                sourceTitle = githubContent.repository;
                chunks = this.contentProcessor.processGitHubContent(githubContent);
                console.log(`Processed GitHub repository: ${chunks.length} chunks created`);
            }
            else {
                // Documentation processing
                const docContent = await this.webScrapingService.processDocumentation(input.url, {
                    maxDepth: input.maxDepth,
                    onlyMainContent: input.onlyMainContent,
                    maxPages: 1000
                });
                sourceTitle = new URL(input.url).hostname;
                chunks = this.contentProcessor.processDocumentationContent(docContent);
                console.log(`Processed documentation site: ${chunks.length} chunks created from ${docContent.pages.length} pages`);
            }
            if (chunks.length === 0) {
                return {
                    success: false,
                    message: 'No content found to index. Check URL and filters.',
                    processingTime: Date.now() - startTime
                };
            }
            // Generate embeddings for all chunks
            console.log('Generating embeddings...');
            const texts = chunks.map(chunk => chunk.content);
            const embeddings = await this.embeddingService.generateEmbeddings(texts);
            // Prepare vectors for Pinecone
            const vectors = chunks.map((chunk, index) => ({
                id: chunk.id,
                values: embeddings[index],
                metadata: {
                    content: chunk.content.substring(0, 40000), // Pinecone metadata limit
                    type: chunk.type,
                    sourceUrl: chunk.source.url,
                    sourcePath: chunk.source.path,
                    sourceTitle: chunk.source.title || sourceTitle,
                    language: chunk.metadata.language,
                    size: chunk.metadata.size,
                    hash: chunk.metadata.hash,
                    headingLevel: chunk.metadata.headingLevel,
                    section: chunk.metadata.section,
                    dependencies: chunk.metadata.dependencies?.join(',') || undefined
                }
            }));
            // Store in vector database
            console.log('Storing vectors in Pinecone...');
            await this.vectorStoreService.upsertVectors(vectors);
            const processingTime = Date.now() - startTime;
            const sourceId = await this.generateSourceId(input.url);
            return {
                success: true,
                message: `Successfully indexed ${chunks.length} chunks from ${sourceType === 'github' ? 'repository' : 'documentation site'}: ${sourceTitle}`,
                sourceId,
                chunksIndexed: chunks.length,
                processingTime
            };
        }
        catch (error) {
            console.error('Error indexing source:', error);
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof ScoutError
                ? error.message
                : `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            return {
                success: false,
                message: `Failed to index source: ${errorMessage}`,
                processingTime
            };
        }
    }
    /**
     * Detect source type from URL
     */
    detectSourceType(url, explicitType) {
        if (explicitType && explicitType !== 'auto') {
            return explicitType;
        }
        // Auto-detect based on URL pattern
        if (url.includes('github.com')) {
            return 'github';
        }
        return 'documentation';
    }
    /**
     * Generate a source ID for tracking
     */
    async generateSourceId(url) {
        const { createHash } = await import('crypto');
        return createHash('md5').update(url).digest('hex').substring(0, 12);
    }
    /**
     * Validate URL format
     */
    validateUrl(url) {
        try {
            new URL(url);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Check if source is already indexed (future enhancement)
     */
    async isSourceIndexed(url) {
        // This would require maintaining a metadata store
        // For now, we'll always re-index (upsert will handle duplicates)
        return false;
    }
    /**
     * Get indexing statistics for a source (future enhancement)
     */
    async getIndexingStats(sourceId) {
        // This would require maintaining a metadata store
        // For now, return null
        return null;
    }
    /**
     * Health check for the indexing tool
     */
    async healthCheck() {
        try {
            const checks = await Promise.all([
                this.githubService.healthCheck(),
                this.webScrapingService.healthCheck(),
                this.embeddingService.healthCheck(),
                this.vectorStoreService.healthCheck()
            ]);
            return checks.every(check => check === true);
        }
        catch (error) {
            console.error('Index source tool health check failed:', error);
            return false;
        }
    }
}
//# sourceMappingURL=IndexSourceTool.js.map