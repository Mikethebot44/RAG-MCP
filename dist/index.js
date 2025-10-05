#!/usr/bin/env node
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
// Services
import { PineconeVectorStoreService } from './services/PineconeVectorStoreService.js';
import { OpenAIEmbeddingService } from './services/OpenAIEmbeddingService.js';
import { GitHubService } from './services/GitHubService.js';
import { WebScrapingService } from './services/WebScrapingService.js';
import { ContentProcessor } from './services/ContentProcessor.js';
import { SourceRegistryService } from './services/SourceRegistryService.js';
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
import { ScoutError } from './types/index.js';
class ScoutMCPServer {
    server;
    config;
    // Services
    vectorStoreService;
    embeddingService;
    githubService;
    webScrapingService;
    contentProcessor;
    sourceRegistry;
    // Tools
    searchContextTool;
    listSourcesTool;
    findSourcesTool;
    deepResearchTool;
    scrapePageTool;
    indexSourceTool;
    deleteSourceTool;
    indexLocalTool;
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
        const required = ['OPENAI_API_KEY', 'PINECONE_API_KEY', 'PINECONE_INDEX'];
        const missing = required.filter(n => !process.env[n]);
        if (missing.length) {
            throw new ScoutError(`Missing required environment variables: ${missing.join(', ')}`, 'CONFIG_ERROR');
        }
        return {
            processing: {
                maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '1048576'),
                maxChunkSize: parseInt(process.env.CHUNK_SIZE || '8192'),
                chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
                batchSize: parseInt(process.env.BATCH_SIZE || '100')
            },
            github: { token: process.env.GITHUB_TOKEN }
        };
    }
    /**
     * Initialize all services using factory pattern
     */
    initializeServices() {
        console.log('Initializing RAG MCP (OSS)...');
        this.vectorStoreService = new PineconeVectorStoreService();
        this.embeddingService = new OpenAIEmbeddingService();
        this.githubService = new GitHubService(this.config);
        this.webScrapingService = new WebScrapingService();
        this.contentProcessor = new ContentProcessor(this.config);
        this.sourceRegistry = new SourceRegistryService();
    }
    /**
     * Initialize all tools
     */
    initializeTools() {
        this.searchContextTool = new SearchContextTool(this.embeddingService, this.vectorStoreService);
        this.listSourcesTool = new ListSourcesTool(this.vectorStoreService);
        this.findSourcesTool = new FindSourcesTool();
        this.deepResearchTool = new DeepResearchTool();
        this.scrapePageTool = new ScrapePageTool(this.webScrapingService);
        this.indexSourceTool = new IndexSourceTool(this.githubService, this.webScrapingService, this.contentProcessor, this.embeddingService, this.vectorStoreService);
        this.deleteSourceTool = new DeleteSourceTool(this.vectorStoreService, this.listSourcesTool);
        this.indexLocalTool = new IndexLocalTool(this.embeddingService, this.vectorStoreService, this.contentProcessor);
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
                    case 'find_sources':
                        const findResult = await this.findSourcesTool.execute(args);
                        return {
                            content: [{
                                    type: 'text',
                                    text: this.formatFindResult(findResult)
                                }]
                        };
                    case 'deep_research':
                        const researchResult = await this.deepResearchTool.execute(args);
                        return {
                            content: [{
                                    type: 'text',
                                    text: this.formatResearchResult(researchResult)
                                }]
                        };
                    case 'scrape_page':
                        const scrapeResult = await this.scrapePageTool.execute(args);
                        return {
                            content: [{
                                    type: 'text',
                                    text: this.formatScrapeResult(scrapeResult)
                                }]
                        };
                    case 'index_source':
                        const indexRes = await this.indexSourceTool.execute(args);
                        return { content: [{ type: 'text', text: indexRes.success ? indexRes.message : `Error: ${indexRes.message}` }] };
                    case 'delete_source':
                        const delRes = await this.deleteSourceTool.execute(args);
                        return { content: [{ type: 'text', text: delRes.success ? delRes.message : `Error: ${delRes.message}` }] };
                    case 'index_local':
                        const ilRes = await this.indexLocalTool.execute(args);
                        return { content: [{ type: 'text', text: ilRes.success ? ilRes.message : `Error: ${ilRes.message}` }] };
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
                            text: `Error: ${errorMessage}`
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
    /**
     * Format search result for display
     */
    formatSearchResult(result) {
        if (!result.success) {
            const timeStr = result.searchTime ? ` (${Math.round(result.searchTime)}ms)` : '';
            return `Error: ${result.message}${timeStr}`;
        }
        if (!result.results || result.results.length === 0) {
            const timeStr = result.searchTime ? ` (${Math.round(result.searchTime)}ms)` : '';
            return `No results found${timeStr}\n\n` +
                'Try:\n' +
                '- Using different keywords\n' +
                '- Lowering the similarity threshold\n' +
                '- Checking if sources are indexed with `list_sources`';
        }
        const timeStr = result.searchTime ? ` (${Math.round(result.searchTime)}ms)` : '';
        let output = `Found ${result.results.length} results${timeStr}\n\n`;
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
            return `Error: ${result.message}${timeStr}`;
        }
        if (!result.sources || result.sources.length === 0) {
            return `No sources indexed yet`;
        }
        const timeStr = result.retrievalTime ? ` (${Math.round(result.retrievalTime)}ms)` : '';
        let output = `${result.totalSources} indexed sources (${result.totalChunks} chunks)${timeStr}\n\n`;
        result.sources.forEach((source, index) => {
            const status = source.status;
            const date = new Date(source.indexedAt).toLocaleDateString();
            output += `**${index + 1}. ${source.title}**\n`;
            output += `${status} • Chunks: ${source.chunkCount} • Indexed: ${date}\n`;
            output += `URL: ${source.url}\n`;
            output += `ID: ${source.id}\n\n`;
        });
        return output.trim();
    }
    /**
     * Format find sources result for display
     */
    formatFindResult(result) {
        if (result.success) {
            return `${result.message}\n\n` +
                `Sources found: ${result.sources?.length || 0}`;
        }
        else {
            return `Error: ${result.message}`;
        }
    }
    /**
     * Format research result for display
     */
    formatResearchResult(result) {
        if (result.success) {
            return `${result.message}\n\n` +
                `Sources analyzed: ${result.sourcesAnalyzed || 0}\n` +
                `Insights generated: ${result.insights?.length || 0}`;
        }
        else {
            return `Error: ${result.message}`;
        }
    }
    /**
     * Format scrape result for display
     */
    formatScrapeResult(result) {
        if (result.success) {
            return (result.markdown || '').toString();
        }
        else {
            return `❌ ${result.message}`;
        }
    }
    /**
     * Initialize and start the server
     */
    async start() {
        try {
            console.log('Starting RAG MCP Server (OSS)...');
            console.log('Environment check:');
            console.log(`- OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
            console.log(`- PINECONE_API_KEY: ${process.env.PINECONE_API_KEY ? 'SET' : 'NOT SET'}`);
            console.log(`- PINECONE_INDEX: ${process.env.PINECONE_INDEX || 'NOT SET'}`);
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
            console.log('RAG MCP Server is running and waiting for connections...');
            console.log('Configuration:');
            console.log(`- Mode: OSS (OpenAI + Pinecone)`);
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
    async shutdown() {
        console.log('Shutting down RAG MCP Server...');
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