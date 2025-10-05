import { z } from 'zod';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { 
  IndexSourceInputSchema,
  IndexSourceInput,
  SourceType,
  ScoutError,
  IEmbeddingService,
  IVectorStoreService
} from '../types/index.js';
import { GitHubService } from '../services/GitHubService.js';
import { WebScrapingService } from '../services/WebScrapingService.js';
import { ContentProcessor } from '../services/ContentProcessor.js';
import { createHash } from 'crypto';

export class IndexSourceTool {
  private githubService: GitHubService;
  private webScrapingService: WebScrapingService;
  private contentProcessor: ContentProcessor;
  private embeddingService: IEmbeddingService;
  private vectorStoreService: IVectorStoreService;

  constructor(
    githubService: GitHubService,
    webScrapingService: WebScrapingService,
    contentProcessor: ContentProcessor,
    embeddingService: IEmbeddingService,
    vectorStoreService: IVectorStoreService
  ) {
    this.githubService = githubService;
    this.webScrapingService = webScrapingService;
    this.contentProcessor = contentProcessor;
    this.embeddingService = embeddingService;
    this.vectorStoreService = vectorStoreService;
  }

  /**
   * Get tool definition for MCP
   */
  getToolDefinition(): Tool {
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
          },
          tokensPerChunk: {
            type: 'number',
            description: 'Approximate tokens per chunk to re-chunk text after scraping (4 chars ≈ 1 token)'
          },
          scrapingBackend: {
            type: 'string',
            enum: ['playwright', 'firecrawl'],
            default: 'playwright',
            description: 'Scraping backend for documentation (playwright default, firecrawl optional)'
          }
        },
        required: ['url']
      }
    };
  }

  /**
   * Execute the indexing operation
   */
  async execute(input: IndexSourceInput): Promise<{
    success: boolean;
    message: string;
    sourceId?: string;
    chunksIndexed?: number;
    processingTime?: number;
  }> {
    const startTime = Date.now();
    
    try {
      console.log(`Starting to index source: ${input.url}`);
      
      // Detect source type
      const sourceType = this.detectSourceType(input.url, input.sourceType);
      console.log(`Detected source type: ${sourceType}`);

      // OSS mode: no dashboard; keep placeholder id for compatibility
      let documentId: string | null = null;

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

      } else {
        // Documentation processing with backend choice
        const backend = input.scrapingBackend || 'playwright'
        if (backend === 'firecrawl') {
          const apiKey = process.env.FIRECRAWL_API_KEY
          if (!apiKey) {
            throw new ScoutError('FIRECRAWL_API_KEY is required for firecrawl backend', 'CONFIG_ERROR')
          }
          // Try Firecrawl v1 crawl first with updated schema; fallback to scrape
          const authHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } as const
          const crawlPayload = { url: input.url, crawlerOptions: { maxDepth: input.maxDepth }, scrapeOptions: { formats: ['markdown'] } }
          let data: any | null = null
          let resp = await fetch('https://api.firecrawl.dev/v1/crawl', { method: 'POST', headers: authHeaders, body: JSON.stringify(crawlPayload) }).catch(() => null as any)
          if (resp && resp.ok) {
            data = await resp.json().catch(() => ({}))
          }
          if (!data) {
            const scrapePayload = { url: input.url, formats: ['markdown'] }
            resp = await fetch('https://api.firecrawl.dev/v1/scrape', { method: 'POST', headers: authHeaders, body: JSON.stringify(scrapePayload) }).catch(() => null as any)
            if (resp && resp.ok) {
              data = await resp.json().catch(() => ({}))
            }
          }
          if (!data) {
            const text = resp ? await resp.text().catch(() => '') : 'no response'
            throw new ScoutError(`Firecrawl crawl/scrape failed: ${resp ? `${resp.status} ${resp.statusText}` : 'network error'} ${text}`, 'SCRAPING_ERROR')
          }
          // Normalize outputs from either endpoint
          const results = data?.results || data?.data || (Array.isArray(data) ? data : [])
          const pages = (results || []).map((r: any) => ({
            url: r.url || input.url,
            title: r.title || r.url || input.url,
            content: r.markdown || r.content || r.text || '',
            headings: [],
            breadcrumbs: []
          }))
          const docContent = { url: input.url, pages }
          sourceTitle = new URL(input.url).hostname;
          if (input.tokensPerChunk && input.tokensPerChunk > 0) {
            chunks = this.rechunkDocumentation(docContent as any, input.tokensPerChunk)
          } else {
            chunks = this.contentProcessor.processDocumentationContent(docContent as any);
          }
          console.log(`Processed documentation site (firecrawl): ${chunks.length} chunks created from ${pages.length} pages`);
        } else {
          const docContent = await this.webScrapingService.processDocumentation(input.url, {
            maxDepth: input.maxDepth,
            onlyMainContent: input.onlyMainContent,
            maxPages: 1000
          });

          sourceTitle = new URL(input.url).hostname;
          if (input.tokensPerChunk && input.tokensPerChunk > 0) {
            chunks = this.rechunkDocumentation(docContent as any, input.tokensPerChunk)
          } else {
            chunks = this.contentProcessor.processDocumentationContent(docContent);
          }
          console.log(`Processed documentation site: ${chunks.length} chunks created from ${docContent.pages.length} pages`);
        }
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
          documentId: documentId || undefined,
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

      // Calculate token count for status update
      const estimatedTokens = chunks.reduce((sum, c) => {
        try {
          const len = typeof c.content === 'string' ? c.content.length : 0
          const tokens = Math.ceil(len / 4)
          return sum + (isFinite(tokens) ? tokens : 0)
        } catch {
          return sum
        }
      }, 0)

      // Update local registry for list_sources (best-effort)
      try {
        const { SourceRegistryService } = await import('../services/SourceRegistryService.js')
        const registry = new SourceRegistryService()
        await registry.upsert({
          id: sourceId,
          url: input.url,
          type: sourceType,
          title: sourceTitle,
          indexedAt: new Date().toISOString(),
          chunkCount: chunks.length,
          status: 'indexed'
        })
      } catch {}

      return {
        success: true,
        message: `Successfully indexed ${chunks.length} chunks from ${sourceType === 'github' ? 'repository' : 'documentation site'}: ${sourceTitle}`,
        sourceId,
        chunksIndexed: chunks.length,
        processingTime
      };

    } catch (error) {
      console.error('Error indexing source:', error);
      try {
        const { SourceRegistryService } = await import('../services/SourceRegistryService.js')
        const registry = new SourceRegistryService()
        await registry.upsert({
          id: await this.generateSourceId(input.url),
          url: input.url,
          type: this.detectSourceType(input.url, input.sourceType),
          title: new URL(input.url).hostname,
          indexedAt: new Date().toISOString(),
          chunkCount: 0,
          status: 'failed'
        })
      } catch {}
      
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
  private detectSourceType(url: string, explicitType?: string): SourceType {
    if (explicitType && explicitType !== 'auto') {
      return explicitType as SourceType;
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
  private async generateSourceId(url: string): Promise<string> {
    const { createHash } = await import('crypto');
    return createHash('md5').update(url).digest('hex').substring(0, 12);
  }

  /**
   * Validate URL format
   */
  private validateUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if source is already indexed (future enhancement)
   */
  private async isSourceIndexed(url: string): Promise<boolean> {
    // This would require maintaining a metadata store
    // For now, we'll always re-index (upsert will handle duplicates)
    return false;
  }

  /**
   * Re-chunk documentation pages according to tokensPerChunk
   */
  private rechunkDocumentation(docContent: { url: string; pages: Array<{ url: string; title: string; content: string; headings: string[]; breadcrumbs: string[] }> }, tokensPerChunk: number) {
    const approxChars = Math.max(128, Math.floor(tokensPerChunk * 4))
    const chunks: any[] = []
    for (const page of docContent.pages) {
      const base = {
        id: (this.contentProcessor as any)['generateChunkId']?.(docContent.url, page.url) ?? `${docContent.url}:${page.url}`,
        sourceUrl: docContent.url,
        sourcePath: page.url,
        sourceTitle: page.title,
        type: 'documentation' as const,
        size: page.content.length,
        language: 'markdown'
      }
      let idx = 0
      for (let pos = 0; pos < page.content.length; ) {
        const end = Math.min(page.content.length, pos + approxChars)
        const slice = page.content.slice(pos, end)
        chunks.push({
          id: `${base.id}_${idx++}`,
          content: slice,
          type: base.type,
          source: { url: base.sourceUrl, type: 'documentation', path: base.sourcePath, title: base.sourceTitle },
          metadata: { size: slice.length, hash: 'n/a', section: undefined }
        })
        // 10% overlap
        const overlap = Math.floor(approxChars * 0.1)
        pos = end - overlap
        if (pos <= 0) pos = end
      }
    }
    return chunks
  }

  /**
   * Get indexing statistics for a source (future enhancement)
   */
  async getIndexingStats(sourceId: string): Promise<{
    sourceId: string;
    url: string;
    indexedAt: Date;
    chunkCount: number;
    lastUpdated: Date;
  } | null> {
    // This would require maintaining a metadata store
    // For now, return null
    return null;
  }

  /**
   * Health check for the indexing tool
   */
  async healthCheck(): Promise<boolean> {
    try {
      const checks = await Promise.all([
        this.githubService.healthCheck(),
        this.webScrapingService.healthCheck(),
        this.embeddingService.healthCheck(),
        this.vectorStoreService.healthCheck()
      ]);

      return checks.every(check => check === true);
    } catch (error) {
      console.error('Index source tool health check failed:', error);
      return false;
    }
  }
}