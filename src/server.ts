import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Services
import { PineconeVectorStoreService } from './services/PineconeVectorStoreService.js';
import { OpenAIEmbeddingService } from './services/OpenAIEmbeddingService.js';
import { GitHubService } from './services/GitHubService.js';
import { WebScrapingService } from './services/WebScrapingService.js';
import { ContentProcessor } from './services/ContentProcessor.js';

// Tools
import { SearchContextTool } from './tools/SearchContextTool.js';
import { ListSourcesTool } from './tools/ListSourcesTool.js';
import { FindSourcesTool } from './tools/FindSourcesTool.js';
import { DeepResearchTool } from './tools/DeepResearchTool.js';
import { ScrapePageTool } from './tools/ScrapePageTool.js';
import { IndexSourceTool } from './tools/IndexSourceTool.js';
import { DeleteSourceTool } from './tools/DeleteSourceTool.js';
import { IndexLocalTool } from './tools/IndexLocalTool.js';

// Types
import { ScoutConfig, ScoutError, IVectorStoreService, IEmbeddingService } from './types/index.js';

export interface ServerOptions {
  httpMode?: boolean;
  port?: number;
  verbose?: boolean;
  configPath?: string;
}

export async function createServer(options: ServerOptions = {}): Promise<{ start(): Promise<void>; shutdown(): Promise<void> }> {
  const { httpMode = false, port = 3000, verbose = false } = options;

  class ScoutMCPServer {
    private server: Server;
    private config: ScoutConfig;
    
    // Services
    private vectorStoreService!: IVectorStoreService;
    private embeddingService!: IEmbeddingService;
    private githubService!: GitHubService;
    private webScrapingService!: WebScrapingService;
    private contentProcessor!: ContentProcessor;
    
    // Tools
    private searchContextTool!: SearchContextTool;
    private listSourcesTool!: ListSourcesTool;
    private findSourcesTool!: FindSourcesTool;
    private deepResearchTool!: DeepResearchTool;
    private scrapePageTool!: ScrapePageTool;
  private indexSourceTool!: IndexSourceTool;
  private deleteSourceTool!: DeleteSourceTool;
  private indexLocalTool!: IndexLocalTool;

    constructor() {
      this.server = new Server({
        name: 'scout-mcp',
        version: '1.0.0',
      }, {
        capabilities: {
          tools: {}
        }
      });

      this.config = this.loadConfiguration();
      this.initializeServices();
      this.initializeTools();
      this.setupHandlers();
    }

    /**
     * Load configuration from environment variables
     */
    private loadConfiguration(): ScoutConfig {
      const requiredEnvVars = ['OPENAI_API_KEY', 'PINECONE_API_KEY', 'PINECONE_INDEX'];
      const missingVars = requiredEnvVars.filter(name => !process.env[name]);

      if (missingVars.length > 0) {
        throw new ScoutError(
          `Missing required environment variables: ${missingVars.join(', ')}\n\n` +
          'Set the following environment variables:\n' +
          '- OPENAI_API_KEY: Your OpenAI API key\n' +
          '- PINECONE_API_KEY: Your Pinecone API key\n' +
          '- PINECONE_INDEX: Your Pinecone index name\n' +
          'Optional variables:\n' +
          '- GITHUB_TOKEN: GitHub token for higher rate limits (optional)\n' +
          '- MAX_FILE_SIZE: Maximum file size in bytes (default: 1048576)\n' +
          '- CHUNK_SIZE: Maximum chunk size in characters (default: 8192)\n' +
          '- BATCH_SIZE: Processing batch size (default: 100)',
          'CONFIG_ERROR'
        );
      }

      return {
        processing: {
          maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '1048576'),
          maxChunkSize: parseInt(process.env.CHUNK_SIZE || '8192'),
          chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
          batchSize: parseInt(process.env.BATCH_SIZE || '100')
        },
        github: {
          token: process.env.GITHUB_TOKEN
        }
      };
    }


    /**
     * Initialize all services
     */
    private initializeServices(): void {
      if (verbose) console.log('Initializing RAG MCP (OSS)...');

      this.vectorStoreService = new PineconeVectorStoreService();
      this.embeddingService = new OpenAIEmbeddingService();
      this.githubService = new GitHubService(this.config);
      this.webScrapingService = new WebScrapingService();
      this.contentProcessor = new ContentProcessor(this.config);

      if (verbose) console.log('Services initialized successfully');
    }


    /**
     * Initialize all tools
     */
    private initializeTools(): void {
      this.searchContextTool = new SearchContextTool(
        this.embeddingService,
        this.vectorStoreService
      );

      this.listSourcesTool = new ListSourcesTool(
        this.vectorStoreService
      );

      // Web search tools
      this.findSourcesTool = new FindSourcesTool();
      this.deepResearchTool = new DeepResearchTool();
      this.scrapePageTool = new ScrapePageTool();
      this.indexSourceTool = new IndexSourceTool(
        this.githubService,
        this.webScrapingService,
        this.contentProcessor,
        this.embeddingService,
        this.vectorStoreService
      );
      this.deleteSourceTool = new DeleteSourceTool(this.vectorStoreService, this.listSourcesTool);
      this.indexLocalTool = new IndexLocalTool(this.embeddingService, this.vectorStoreService, this.contentProcessor)

      if (verbose) console.log('Tools initialized successfully');
    }

    /**
     * Set up MCP protocol handlers
     */
    private setupHandlers(): void {
      // List available tools
      this.server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
          tools: [
            this.searchContextTool.getToolDefinition(),
            this.listSourcesTool.getToolDefinition(),
            this.findSourcesTool.getToolDefinition(),
            this.deepResearchTool.getToolDefinition(),
            this.scrapePageTool.getToolDefinition(),
            this.indexSourceTool.getToolDefinition(),
            this.deleteSourceTool.getToolDefinition(),
            this.indexLocalTool.getToolDefinition()
          ]
        };
      });

      // Handle tool calls
      this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
          switch (name) {
            case 'search_context':
              const searchResult = await this.searchContextTool.execute(args as any);
              return {
                content: [{
                  type: 'text',
                  text: this.formatSearchResult(searchResult)
                }]
              };

            case 'list_sources':
              const listResult = await this.listSourcesTool.execute(args as any);
              return {
                content: [{
                  type: 'text',
                  text: this.formatListResult(listResult)
                }]
              };

            case 'find_sources':
              const findRes = await this.findSourcesTool.execute(args as any);
              return {
                content: [{
                  type: 'text',
                  text: this.formatFindSourcesResult(findRes)
                }]
              };

            case 'deep_research':
              const deepRes = await this.deepResearchTool.execute(args as any);
              return {
                content: [{
                  type: 'text',
                  text: this.formatDeepResearchResult(deepRes)
                }]
              };

            case 'scrape_page':
              const scrapeRes = await this.scrapePageTool.execute(args as any);
              return {
                content: [{
                  type: 'text',
                  text: scrapeRes.success
                    ? (scrapeRes.markdown || '')
                    : `❌ ${scrapeRes.message}`
                }]
              };
            case 'index_source': {
              const res = await this.indexSourceTool.execute(args as any)
              return { content: [{ type: 'text', text: res.success ? `✅ ${res.message}` : `❌ ${res.message}` }] }
            }
            case 'delete_source': {
              const res = await this.deleteSourceTool.execute(args as any)
              return { content: [{ type: 'text', text: res.success ? `✅ ${res.message}` : `❌ ${res.message}` }] }
            }
            case 'index_local': {
              const res = await this.indexLocalTool.execute(args as any)
              return { content: [{ type: 'text', text: res.success ? `✅ ${res.message}` : `❌ ${res.message}` }] }
            }

            default:
              throw new ScoutError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
          }
        } catch (error) {
          console.error(`Error executing tool ${name}:`, error);
          
          const errorMessage = error instanceof ScoutError 
            ? error.message 
            : `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`;

          return {
            content: [{
              type: 'text',
              text: `❌ Error: ${errorMessage}`
            }],
            isError: true
          };
        }
      });

      if (verbose) console.log('MCP handlers configured');
    }

    // Result formatting methods (same as original)
    private formatSearchResult(result: any): string {
      if (!result.success) {
        const timeStr = result.searchTime ? ` (${Math.round(result.searchTime)}ms)` : '';
        return `❌ ${result.message}${timeStr}`;
      }

      if (!result.results || result.results.length === 0) {
        const timeStr = result.searchTime ? ` (${Math.round(result.searchTime)}ms)` : '';
        return `🔍 No results found${timeStr}\n\n` +
          'Try:\n' +
          '- Using different keywords\n' +
          '- Lowering the similarity threshold\n' +
          '- Checking if sources are indexed with `list_sources`';
      }

      const timeStr = result.searchTime ? ` (${Math.round(result.searchTime)}ms)` : '';
      let output = `🔍 Found ${result.results.length} results${timeStr}\n\n`;

      result.results.forEach((res: any, index: number) => {
        const sourceInfo = res.source.path 
          ? `${res.source.url}/${res.source.path}`
          : res.source.url;
        
        const score = (res.score * 100).toFixed(1);
        const preview = res.content.length > 300 
          ? res.content.substring(0, 300) + '...'
          : res.content;

        output += `## Result ${index + 1} (${score}% match)\n`;
        output += `**Source:** ${sourceInfo}\n`;
        if (res.metadata.language) output += `**Language:** ${res.metadata.language}\n`;
        if (res.metadata.section) output += `**Section:** ${res.metadata.section}\n`;
        output += '\n' + preview + '\n\n---\n\n';
      });

      return output.trim();
    }

    private formatListResult(result: any): string {
      if (!result.success) {
        const timeStr = result.retrievalTime ? ` (${Math.round(result.retrievalTime)}ms)` : '';
        return `❌ ${result.message}${timeStr}`;
      }

      if (!result.sources || result.sources.length === 0) {
        return `📚 No sources indexed yet`;
      }

      const timeStr = result.retrievalTime ? ` (${Math.round(result.retrievalTime)}ms)` : '';
      let output = `📚 ${result.totalSources} indexed sources (${result.totalChunks} chunks)${timeStr}\n\n`;

      result.sources.forEach((source: any, index: number) => {
        const status = source.status === 'indexed' ? '✅' : source.status === 'indexing' ? '🔄' : '❌';
        const date = new Date(source.indexedAt).toLocaleDateString();
        
        output += `**${index + 1}. ${source.title}**\n`;
        output += `${status} ${source.status} • 📊 ${source.chunkCount} chunks • 📅 ${date}\n`;
        output += `🔗 ${source.url}\n`;
        output += `🆔 ${source.id}\n\n`;
      });

      return output.trim();
    }

    

    private formatFindSourcesResult(result: any): string {
      if (!result.success) return `❌ ${result.message}`
      const timeStr = result.searchTime ? ` (${Math.round(result.searchTime)}ms)` : ''
      const lines: string[] = []
      lines.push(`🔎 Found ${result.sources?.length || 0} sources${timeStr}`)
      for (const [i, s] of (result.sources || []).entries()) {
        lines.push(`${i + 1}. ${s.title || s.url} — ${s.url}${s.category ? ` (${s.category})` : ''}`)
      }
      return lines.join('\n')
    }

    private formatDeepResearchResult(result: any): string {
      if (!result.success) return `❌ ${result.message}`
      const started = typeof result.started === 'number' ? result.started : 0
      const completed = typeof result.completed === 'number' ? result.completed : 0
      return `🧭 Deep research queued. Started: ${started}, Completed: ${completed}`
    }

    /**
     * Initialize and start the server
     */
    async start(): Promise<void> {
      try {
        if (verbose) console.log('Starting RAG MCP Server (OSS)...');
        if (verbose) {
          console.log('Environment check:');
          console.log(`- OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
          console.log(`- PINECONE_API_KEY: ${process.env.PINECONE_API_KEY ? 'SET' : 'NOT SET'}`);
          console.log(`- PINECONE_INDEX: ${process.env.PINECONE_INDEX || 'NOT SET'}`);
        }



        // Initialize vector store
        if (verbose) console.log('Initializing vector store...');
        await this.vectorStoreService.initialize();
        if (verbose) console.log('Vector store initialized');

        // Health check all services
        if (verbose) console.log('Running health checks...');
        const healthChecks = await Promise.allSettled([
          this.vectorStoreService.healthCheck(),
          this.embeddingService.healthCheck(),
          this.githubService.healthCheck(),
          this.webScrapingService.healthCheck()
        ]);

        const failedChecks = healthChecks
          .map((check, index) => ({ check, service: ['VectorStore', 'Embedding', 'GitHub', 'WebScraping'][index] }))
          .filter(({ check }) => check.status === 'rejected' || check.value === false);

        if (failedChecks.length > 0) {
          console.warn('Some services failed health checks:', failedChecks.map(f => f.service));
          // Continue anyway - some services might work
        } else if (verbose) {
          console.log('All services passed health checks');
        }

        // Start the server
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        
        if (verbose) {
          console.log('RAG MCP Server is running and waiting for connections...');
          console.log('Configuration:');
          console.log(`- Mode: OSS (OpenAI + Pinecone)`);
          console.log(`- Max File Size: ${this.config.processing.maxFileSize} bytes`);
          console.log(`- Chunk Size: ${this.config.processing.maxChunkSize} chars`);
        }

        // Keep the process alive
        await new Promise<void>((resolve) => {
          process.on('SIGINT', () => {
            if (verbose) console.log('\nShutting down...');
            resolve();
          });
          process.on('SIGTERM', () => {
            if (verbose) console.log('\nShutting down...');
            resolve();
          });
        });

      } catch (error) {
        console.error('Failed to start RAG MCP Server:', error);
        
        if (error instanceof ScoutError) {
          console.error('\nRAG MCP Error Details:');
          console.error('- Code:', error.code);
          console.error('- Message:', error.message);
          if (error.details) {
            console.error('- Details:', error.details);
          }
          console.error('\nPlease check your configuration and try again.');
        }
        
        process.exit(1);
      }
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
      if (verbose) console.log('Shutting down RAG MCP Server...');
      
      try {
        // Cleanup web scraping service
        await this.webScrapingService.cleanup();
        if (verbose) console.log('Services cleaned up successfully');
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    }
  }

  const server = new ScoutMCPServer();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    if (verbose) console.log('\nReceived SIGINT, shutting down gracefully...');
    await server.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    if (verbose) console.log('\nReceived SIGTERM, shutting down gracefully...');
    await server.shutdown();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // Start the server
  await server.start();

  return server;
}




