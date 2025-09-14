#!/usr/bin/env node
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
// Services
import { VectorStoreService } from './services/VectorStoreService.js';
import { EmbeddingService } from './services/EmbeddingService.js';
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
import { ScoutError } from './types/index.js';
class ScoutMCPServer {
    server;
    config;
    // Services (can be either direct API services or Scout proxy services)
    vectorStoreService;
    embeddingService;
    githubService;
    webScrapingService;
    contentProcessor;
    // Tools
    indexSourceTool;
    searchContextTool;
    listSourcesTool;
    deleteSourceTool;
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
    loadConfiguration() {
        // Check if Scout API keys are provided (SaaS mode)
        const hasScoutConfig = process.env.SCOUT_API_KEY && process.env.SCOUT_PROJECT_ID;
        if (hasScoutConfig) {
            // Scout API mode - only Scout keys required
            console.log('🔄 Detected Scout API configuration (SaaS mode)');
            return {
                scout: {
                    apiKey: process.env.SCOUT_API_KEY,
                    projectId: process.env.SCOUT_PROJECT_ID,
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
        else {
            // Self-hosted mode - require individual API keys
            console.log('🏠 Using self-hosted mode (direct API access)');
            const requiredEnvVars = ['PINECONE_API_KEY', 'OPENAI_API_KEY'];
            const missingVars = requiredEnvVars.filter(name => !process.env[name]);
            if (missingVars.length > 0) {
                throw new ScoutError(`Missing required environment variables for self-hosted mode: ${missingVars.join(', ')}\n\n` +
                    '🏠 **Self-hosted mode** (current):  \n' +
                    '- PINECONE_API_KEY: Your Pinecone API key\n' +
                    '- OPENAI_API_KEY: Your OpenAI API key\n' +
                    'Optional variables:\n' +
                    '- PINECONE_ENVIRONMENT: Pinecone environment (default: us-east-1)\n' +
                    '- PINECONE_INDEX: Pinecone index name (default: scout-index)\n' +
                    '- GITHUB_TOKEN: GitHub token for higher rate limits\n' +
                    '- MAX_FILE_SIZE: Maximum file size in bytes (default: 1048576)\n' +
                    '- CHUNK_SIZE: Maximum chunk size in characters (default: 8192)\n' +
                    '- BATCH_SIZE: Processing batch size (default: 100)\n\n' +
                    '🚀 **Or use Scout SaaS mode**:  \n' +
                    '- SCOUT_API_KEY: Your Scout API key (scout_abc123...)\n' +
                    '- SCOUT_PROJECT_ID: Your Scout project UUID\n' +
                    '- SCOUT_API_URL: Scout API URL (optional, default: https://api.scout.ai)', 'CONFIG_ERROR');
            }
            return {
                pinecone: {
                    apiKey: process.env.PINECONE_API_KEY,
                    environment: process.env.PINECONE_ENVIRONMENT || 'us-east-1',
                    indexName: process.env.PINECONE_INDEX || 'scout-index'
                },
                openai: {
                    apiKey: process.env.OPENAI_API_KEY,
                    model: process.env.OPENAI_MODEL || 'text-embedding-3-small'
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
    }
    /**
     * Initialize all services using factory pattern
     */
    initializeServices() {
        console.log('Initializing Scout MCP Server...');
        // Use factory pattern to select appropriate services based on configuration
        if (this.config.scout) {
            // Scout API mode (SaaS)
            console.log('🚀 Initializing Scout API services (SaaS mode)...');
            this.vectorStoreService = new ScoutVectorStoreService(this.config);
            this.embeddingService = new ScoutEmbeddingService(this.config);
        }
        else {
            // Self-hosted mode (direct API access)
            console.log('🏠 Initializing direct API services (self-hosted mode)...');
            this.vectorStoreService = new VectorStoreService(this.config);
            this.embeddingService = new EmbeddingService(this.config);
        }
        // These services are the same for both modes
        this.githubService = new GitHubService(this.config);
        this.webScrapingService = new WebScrapingService();
        this.contentProcessor = new ContentProcessor(this.config);
        console.log('Services initialized successfully');
    }
    /**
     * Initialize all tools
     */
    initializeTools() {
        this.indexSourceTool = new IndexSourceTool(this.githubService, this.webScrapingService, this.contentProcessor, this.embeddingService, this.vectorStoreService);
        this.searchContextTool = new SearchContextTool(this.embeddingService, this.vectorStoreService);
        this.listSourcesTool = new ListSourcesTool(this.vectorStoreService);
        this.deleteSourceTool = new DeleteSourceTool(this.vectorStoreService, this.listSourcesTool);
        console.log('Tools initialized successfully');
    }
    /**
     * Set up MCP protocol handlers
     */
    setupHandlers() {
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
                        const indexResult = await this.indexSourceTool.execute(args);
                        return {
                            content: [{
                                    type: 'text',
                                    text: this.formatIndexResult(indexResult)
                                }]
                        };
                    case 'search_context':
                        const searchResult = await this.searchContextTool.execute(args);
                        return {
                            content: [{
                                    type: 'text',
                                    text: this.formatSearchResult(searchResult)
                                }]
                        };
                    case 'list_sources':
                        const listResult = await this.listSourcesTool.execute(args);
                        return {
                            content: [{
                                    type: 'text',
                                    text: this.formatListResult(listResult)
                                }]
                        };
                    case 'delete_source':
                        const deleteResult = await this.deleteSourceTool.execute(args);
                        return {
                            content: [{
                                    type: 'text',
                                    text: this.formatDeleteResult(deleteResult)
                                }]
                        };
                    default:
                        throw new ScoutError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
                }
            }
            catch (error) {
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
        console.log('MCP handlers configured');
    }
    /**
     * Format index result for display
     */
    formatIndexResult(result) {
        if (result.success) {
            const timeStr = result.processingTime ? ` (${Math.round(result.processingTime / 1000)}s)` : '';
            return `✅ ${result.message}${timeStr}\n\n` +
                `📊 **Chunks indexed:** ${result.chunksIndexed}\n` +
                `🆔 **Source ID:** ${result.sourceId}`;
        }
        else {
            const timeStr = result.processingTime ? ` (${Math.round(result.processingTime / 1000)}s)` : '';
            return `❌ ${result.message}${timeStr}`;
        }
    }
    /**
     * Format search result for display
     */
    formatSearchResult(result) {
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
        result.results.forEach((res, index) => {
            const sourceInfo = res.source.path
                ? `${res.source.url}/${res.source.path}`
                : res.source.url;
            const score = (res.score * 100).toFixed(1);
            const preview = res.content.length > 300
                ? res.content.substring(0, 300) + '...'
                : res.content;
            output += `## Result ${index + 1} (${score}% match)\n`;
            output += `**Source:** ${sourceInfo}\n`;
            if (res.metadata.language)
                output += `**Language:** ${res.metadata.language}\n`;
            if (res.metadata.section)
                output += `**Section:** ${res.metadata.section}\n`;
            output += '\n' + preview + '\n\n---\n\n';
        });
        return output.trim();
    }
    /**
     * Format list result for display
     */
    formatListResult(result) {
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
        result.sources.forEach((source, index) => {
            const status = source.status === 'indexed' ? '✅' : source.status === 'indexing' ? '🔄' : '❌';
            const date = new Date(source.indexedAt).toLocaleDateString();
            output += `**${index + 1}. ${source.title}**\n`;
            output += `${status} ${source.status} • 📊 ${source.chunkCount} chunks • 📅 ${date}\n`;
            output += `🔗 ${source.url}\n`;
            output += `🆔 ${source.id}\n\n`;
        });
        return output.trim();
    }
    /**
     * Format delete result for display
     */
    formatDeleteResult(result) {
        if (result.success) {
            const timeStr = result.deletionTime ? ` (${Math.round(result.deletionTime)}ms)` : '';
            return `✅ ${result.message}${timeStr}`;
        }
        else {
            const timeStr = result.deletionTime ? ` (${Math.round(result.deletionTime)}ms)` : '';
            return `❌ ${result.message}${timeStr}`;
        }
    }
    /**
     * Initialize and start the server
     */
    async start() {
        try {
            console.log('Starting Scout MCP Server...');
            console.log('Environment check:');
            if (this.config.scout) {
                console.log(`- SCOUT_API_KEY: ${process.env.SCOUT_API_KEY ? 'SET' : 'NOT SET'}`);
                console.log(`- SCOUT_PROJECT_ID: ${process.env.SCOUT_PROJECT_ID ? 'SET' : 'NOT SET'}`);
                console.log(`- SCOUT_API_URL: ${this.config.scout.apiUrl}`);
            }
            else {
                console.log(`- PINECONE_API_KEY: ${process.env.PINECONE_API_KEY ? 'SET' : 'NOT SET'}`);
                console.log(`- OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
            }
            // Initialize vector store
            console.log('Initializing vector store...');
            await this.vectorStoreService.initialize();
            console.log('Vector store initialized');
            // Health check all services
            console.log('Running health checks...');
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
            }
            else {
                console.log('All services passed health checks');
            }
            // Start the server
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            console.log('Scout MCP Server is running and waiting for connections...');
            console.log('Configuration:');
            if (this.config.scout) {
                console.log(`- Mode: Scout API (SaaS)`);
                console.log(`- Project ID: ${this.config.scout.projectId}`);
                console.log(`- API URL: ${this.config.scout.apiUrl}`);
            }
            else {
                console.log(`- Mode: Self-hosted`);
                console.log(`- Pinecone Index: ${this.config.pinecone.indexName}`);
                console.log(`- OpenAI Model: ${this.config.openai.model}`);
            }
            console.log(`- Max File Size: ${this.config.processing.maxFileSize} bytes`);
            console.log(`- Chunk Size: ${this.config.processing.maxChunkSize} chars`);
            console.log('Press Ctrl+C to stop the server');
            // Keep the process alive
            await new Promise((resolve) => {
                process.on('SIGINT', () => {
                    console.log('\nShutting down...');
                    resolve();
                });
                process.on('SIGTERM', () => {
                    console.log('\nShutting down...');
                    resolve();
                });
            });
        }
        catch (error) {
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
    async shutdown() {
        console.log('Shutting down Scout MCP Server...');
        try {
            // Cleanup web scraping service
            await this.webScrapingService.cleanup();
            console.log('Services cleaned up successfully');
        }
        catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}
// Main execution
async function main() {
    const server = new ScoutMCPServer();
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT, shutting down gracefully...');
        await server.shutdown();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        console.log('\nReceived SIGTERM, shutting down gracefully...');
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
}
// Run if this file is executed directly
main().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map