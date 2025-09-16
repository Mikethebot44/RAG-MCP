import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Services
import { ScoutVectorStoreService } from './services/ScoutVectorStoreService.js';
import { ScoutEmbeddingService } from './services/ScoutEmbeddingService.js';
import { GitHubService } from './services/GitHubService.js';
import { WebScrapingService } from './services/WebScrapingService.js';
import { ContentProcessor } from './services/ContentProcessor.js';

// Tools
import { IndexSourceTool } from './tools/IndexSourceTool.js';
import { SearchContextTool } from './tools/SearchContextTool.js';
import { ListSourcesTool } from './tools/ListSourcesTool.js';
import { DeleteSourceTool } from './tools/DeleteSourceTool.js';

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
    private indexSourceTool!: IndexSourceTool;
    private searchContextTool!: SearchContextTool;
    private listSourcesTool!: ListSourcesTool;
    private deleteSourceTool!: DeleteSourceTool;

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
      const requiredEnvVars = ['SCOUT_API_KEY', 'SCOUT_PROJECT_ID'];
      const missingVars = requiredEnvVars.filter(name => !process.env[name]);

      if (missingVars.length > 0) {
        throw new ScoutError(
          `Missing required environment variables: ${missingVars.join(', ')}\n\n` +
          'Set the following environment variables:\n' +
          '- SCOUT_API_KEY: Your Scout API key (scout_abc123...)\n' +
          '- SCOUT_PROJECT_ID: Your Scout project UUID\n' +
          'Optional variables:\n' +
          '- SCOUT_API_URL: Scout API base URL (default: https://scout-mauve-nine.vercel.app)\n' +
          '- GITHUB_TOKEN: GitHub token for higher rate limits (optional)\n' +
          '- MAX_FILE_SIZE: Maximum file size in bytes (default: 1048576)\n' +
          '- CHUNK_SIZE: Maximum chunk size in characters (default: 8192)\n' +
          '- BATCH_SIZE: Processing batch size (default: 100)',
          'CONFIG_ERROR'
        );
      }

      return {
        scout: {
          apiKey: process.env.SCOUT_API_KEY!,
          projectId: process.env.SCOUT_PROJECT_ID!,
          apiUrl: process.env.SCOUT_API_URL || 'https://scout-mauve-nine.vercel.app'
        },
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
      if (verbose) console.log('Initializing Scout MCP Server...');

      this.vectorStoreService = new ScoutVectorStoreService(this.config);
      this.embeddingService = new ScoutEmbeddingService(this.config);
      this.githubService = new GitHubService(this.config);
      this.webScrapingService = new WebScrapingService();
      this.contentProcessor = new ContentProcessor(this.config);

      if (verbose) console.log('Services initialized successfully');
    }


    /**
     * Initialize all tools
     */
    private initializeTools(): void {
      this.indexSourceTool = new IndexSourceTool(
        this.githubService,
        this.webScrapingService,
        this.contentProcessor,
        this.embeddingService,
        this.vectorStoreService
      );

      this.searchContextTool = new SearchContextTool(
        this.embeddingService,
        this.vectorStoreService
      );

      this.listSourcesTool = new ListSourcesTool(
        this.vectorStoreService
      );

      this.deleteSourceTool = new DeleteSourceTool(
        this.vectorStoreService,
        this.listSourcesTool
      );

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
            this.indexSourceTool.getToolDefinition(),
            this.searchContextTool.getToolDefinition(),
            this.listSourcesTool.getToolDefinition(),
            this.deleteSourceTool.getToolDefinition()
          ]
        };
      });

      // Handle tool calls
      this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
          switch (name) {
            case 'index_source':
              const indexResult = await this.indexSourceTool.execute(args as any);
              return {
                content: [{
                  type: 'text',
                  text: this.formatIndexResult(indexResult)
                }]
              };

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

            case 'delete_source':
              const deleteResult = await this.deleteSourceTool.execute(args as any);
              return {
                content: [{
                  type: 'text',
                  text: this.formatDeleteResult(deleteResult)
                }]
              };

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
    private formatIndexResult(result: any): string {
      if (result.success) {
        const timeStr = result.processingTime ? ` (${Math.round(result.processingTime / 1000)}s)` : '';
        return `✅ ${result.message}${timeStr}\n\n` +
          `📊 **Chunks indexed:** ${result.chunksIndexed}\n` +
          `🆔 **Source ID:** ${result.sourceId}`;
      } else {
        const timeStr = result.processingTime ? ` (${Math.round(result.processingTime / 1000)}s)` : '';
        return `❌ ${result.message}${timeStr}`;
      }
    }

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
        return `📚 No sources indexed yet\n\n` +
          'Use the `index_source` tool to index GitHub repositories or documentation sites.';
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

    private formatDeleteResult(result: any): string {
      if (result.success) {
        const timeStr = result.deletionTime ? ` (${Math.round(result.deletionTime)}ms)` : '';
        return `✅ ${result.message}${timeStr}`;
      } else {
        const timeStr = result.deletionTime ? ` (${Math.round(result.deletionTime)}ms)` : '';
        return `❌ ${result.message}${timeStr}`;
      }
    }

    /**
     * Initialize and start the server
     */
    async start(): Promise<void> {
      try {
        if (verbose) console.log('Starting Scout MCP Server...');
        if (verbose) {
          console.log('Environment check:');
          console.log(`- SCOUT_API_KEY: ${process.env.SCOUT_API_KEY ? 'SET' : 'NOT SET'}`);
          console.log(`- SCOUT_PROJECT_ID: ${process.env.SCOUT_PROJECT_ID ? 'SET' : 'NOT SET'}`);
          console.log(`- SCOUT_API_URL: ${this.config.scout.apiUrl}`);
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
          console.log('Scout MCP Server is running and waiting for connections...');
          console.log('Configuration:');
          console.log(`- Mode: Scout API (SaaS)`);
          console.log(`- Project ID: ${this.config.scout.projectId}`);
          console.log(`- API URL: ${this.config.scout.apiUrl}`);
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
        console.error('Failed to start Scout MCP Server:', error);
        
        if (error instanceof ScoutError) {
          console.error('\nScout Error Details:');
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
      if (verbose) console.log('Shutting down Scout MCP Server...');
      
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




