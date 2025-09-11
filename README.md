# Scout MCP Server

An open-source Model Context Protocol (MCP) server that provides RAG-enhanced context to coding agents via vector search. Built as an alternative to proprietary solutions, Scout gives developers control over their vector storage and indexing.

## Features

- **Universal Source Indexing**: Index both GitHub repositories and documentation websites
- **Vector Search**: Semantic search using OpenAI embeddings and Pinecone vector database
- **User-Controlled Storage**: Use your own Pinecone API keys for complete data control
- **Smart Content Processing**: Intelligent chunking for code and documentation
- **MCP Integration**: Works seamlessly with Claude Desktop, Cursor, and other MCP-compatible tools

## Architecture

- **Language**: TypeScript with ESM modules
- **Vector Database**: Pinecone (user-provided API keys)
- **Embeddings**: OpenAI text-embedding-3-small
- **Content Sources**: GitHub API + Web scraping (no local cloning required)
- **Transport**: STDIO for MCP client integration

## Quick Start

### Prerequisites

You need API keys for:
- **Pinecone**: For vector storage ([Get API key](https://www.pinecone.io/))
- **OpenAI**: For text embeddings ([Get API key](https://platform.openai.com/api-keys))
- **GitHub Token** (optional): For higher rate limits ([Create token](https://github.com/settings/tokens))

### Pinecone Setup

The server will **automatically create** a Pinecone index if it doesn't exist, but this can fail due to plan limitations. Here are both approaches:

#### Option 1: Automatic Index Creation (Recommended)
The server will attempt to create an index named `scout-index` (or your custom name) **automatically at startup**.

**When it happens**: 
- ⏰ **At MCP server startup** (not during build/install)
- 🔄 **First time the server runs** with your API key
- ⏳ **Takes 1-2 minutes** for Pinecone to provision the index

**Index specifications**:
- **Dimensions**: 1536 (for text-embedding-3-small)
- **Metric**: cosine
- **Environment**: Starter pod on GCP

**Requirements**:
- Pinecone Starter plan or higher (free tier has limitations)
- API key with index creation permissions
- Available index quota on your account

**What you'll see**:
```
Starting Scout MCP Server...
Vector store initialized  ← Index created here
All services passed health checks
Scout MCP Server is running
```

#### Option 2: Manual Index Creation (Backup)
If automatic creation fails, create the index manually in your Pinecone console:

1. Go to [Pinecone Console](https://app.pinecone.io/)
2. Click "Create Index"
3. Set these values:
   - **Name**: `scout-index` (or match your `PINECONE_INDEX` env var)
   - **Dimensions**: `1536`
   - **Metric**: `cosine`
   - **Pod Type**: `s1.x1` (Starter) or higher
4. Wait for index to be ready (usually 1-2 minutes)

**Index Name**: Make sure the index name matches your `PINECONE_INDEX` environment variable (defaults to `scout-index`).

### Installation

#### Option 1: Global Installation with npm (Recommended)

1. **Install globally**:
   ```bash
   npm install -g scout-mcp
   ```

2. **Set environment variables**:
   ```bash
   # Required
   export PINECONE_API_KEY="your_pinecone_key"
   export OPENAI_API_KEY="your_openai_key"
   
   # Optional
   export PINECONE_ENVIRONMENT="us-east-1"  # Default
   export PINECONE_INDEX="scout-index"    # Default
   export GITHUB_TOKEN="your_github_token"  # For higher rate limits
   export MAX_FILE_SIZE="1048576"           # 1MB default
   export CHUNK_SIZE="8192"                 # Default chunk size
   ```

3. **Quick setup check**:
   ```bash
   # Setup guide
   npx scout-mcp init
   
   # Health check
   npx scout-mcp health
   
   # Start server
   npx scout-mcp start
   ```

4. **Configure Claude Desktop** (add to your MCP settings):
   ```json
   {
     "mcpServers": {
       "scout-mcp": {
         "command": "npx",
         "args": ["scout-mcp", "start"],
         "env": {
           "PINECONE_API_KEY": "${PINECONE_API_KEY}",
           "OPENAI_API_KEY": "${OPENAI_API_KEY}",
           "GITHUB_TOKEN": "${GITHUB_TOKEN}"
         }
       }
     }
   }
   ```

#### Option 2: Run with npx (No Installation)

```bash
# Set environment variables first
export PINECONE_API_KEY="your_pinecone_key"
export OPENAI_API_KEY="your_openai_key"

# Run directly
npx scout-mcp start
```

#### Option 3: Manual Installation (Development)

1. **Clone and build**:
   ```bash
   git clone <repository-url>
   cd scout-mcp
   npm install
   npm run build
   ```

2. **Run locally**:
   ```bash
   npm start
   ```

### First Startup

**What happens when the server starts for the first time:**

1. **Server Initialization** (instant)
   - Loads configuration from environment variables
   - Validates API keys are present

2. **Pinecone Index Creation** (1-2 minutes)
   - Automatically creates `scout-index` if it doesn't exist
   - Waits for index to be ready for operations
   - ⚠️ **This is when creation might fail** (see troubleshooting if issues occur)

3. **Service Health Checks** (few seconds)
   - Tests connections to Pinecone, OpenAI, and GitHub
   - Reports any service issues

4. **Ready for Requests** 
   - Server is now ready to accept MCP tool calls
   - You can start using `index_source`, `search_context`, etc.

**If startup fails**, check the error message against the Troubleshooting section below.

## CLI Commands

Once installed, Scout MCP provides several helpful CLI commands:

```bash
# Get setup instructions and configuration help
npx scout-mcp init

# Check environment variables and configuration
npx scout-mcp health

# Start the MCP server
npx scout-mcp start

# Start with verbose logging
npx scout-mcp start --verbose

# Show version information
npx scout-mcp version

# Show help
npx scout-mcp --help
```

The `init` command provides a complete setup guide including environment variable configuration and Claude Desktop integration instructions.

## Available Tools

### 1. `index_source`
Index a GitHub repository or documentation website for RAG search.

**Parameters**:
- `url` (required): GitHub repository URL or documentation URL
- `sourceType`: "auto", "github", or "documentation" (auto-detects by default)
- `branch`: Git branch for GitHub repos (default: "main")
- `includePatterns`: File patterns to include (e.g., ["*.ts", "*.js"])
- `excludePatterns`: File patterns to exclude (e.g., ["node_modules/**"])
- `maxFileSize`: Maximum file size in bytes (default: 1MB)
- `maxDepth`: Maximum crawl depth for documentation (default: 3)
- `onlyMainContent`: Extract only main content for docs (default: true)

**Examples**:
```javascript
// Index a GitHub repository
index_source({
  url: "https://github.com/facebook/react",
  includePatterns: ["*.ts", "*.tsx", "*.js", "*.jsx"],
  excludePatterns: ["**/*.test.*", "**/node_modules/**"]
})

// Index documentation
index_source({
  url: "https://docs.stripe.com",
  maxDepth: 4
})
```

### 2. `search_context`
Search indexed sources for relevant context based on a query.

**Parameters**:
- `query` (required): Search query for finding relevant context
- `maxResults`: Maximum number of results (default: 10)
- `sources`: Filter by specific source URLs/IDs
- `includeCode`: Include code snippets in results (default: true)
- `includeDoc`: Include documentation in results (default: true)
- `threshold`: Similarity threshold 0-1 (default: 0.7)

**Example**:
```javascript
search_context({
  query: "How to handle authentication with hooks?",
  maxResults: 5,
  threshold: 0.8
})
```

### 3. `list_sources`
List all indexed sources with metadata and statistics.

**Example**:
```javascript
list_sources({})
```

### 4. `delete_source`
Delete an indexed source and all its associated chunks.

**Parameters**:
- `sourceId` (required): ID of the source to delete (from `list_sources`)

**Example**:
```javascript
delete_source({
  sourceId: "abc123def456"
})
```

## How It Works

1. **Content Acquisition**:
   - GitHub repos: Uses GitHub API (no cloning required)
   - Documentation: Web scraping with content extraction

2. **Intelligent Chunking**:
   - Code files: Respects function/class boundaries
   - Documentation: Chunks by headings and sections
   - Maintains context with overlapping chunks

3. **Vector Storage**:
   - Generates embeddings using OpenAI text-embedding-3-small
   - Stores in Pinecone with rich metadata for filtering
   - Enables semantic search with similarity scoring

4. **Search & Retrieval**:
   - Query embedding generation
   - Vector similarity search with filtering
   - Result ranking and diversification

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PINECONE_API_KEY` | ✅ | - | Your Pinecone API key |
| `OPENAI_API_KEY` | ✅ | - | Your OpenAI API key |
| `PINECONE_ENVIRONMENT` | ❌ | us-east-1 | Pinecone environment |
| `PINECONE_INDEX` | ❌ | scout-index | Pinecone index name |
| `GITHUB_TOKEN` | ❌ | - | GitHub token for higher rate limits |
| `MAX_FILE_SIZE` | ❌ | 1048576 | Max file size in bytes (1MB) |
| `CHUNK_SIZE` | ❌ | 8192 | Max chunk size in characters |
| `CHUNK_OVERLAP` | ❌ | 200 | Overlap between chunks |
| `BATCH_SIZE` | ❌ | 100 | Processing batch size |

### Supported URL Formats

**GitHub repositories**:
- `https://github.com/facebook/react`
- `https://github.com/microsoft/typescript`
- `https://github.com/vercel/next.js/tree/canary/packages/next`

**Documentation sites**:
- `https://docs.stripe.com`
- `https://nextjs.org/docs`
- `https://react.dev/learn`

## Development

### Project Structure
```
src/
├── types/index.ts              # TypeScript interfaces
├── services/
│   ├── VectorStoreService.ts   # Pinecone integration
│   ├── EmbeddingService.ts     # OpenAI embeddings
│   ├── GitHubService.ts        # GitHub API client
│   ├── WebScrapingService.ts   # Documentation scraping
│   └── ContentProcessor.ts     # Content chunking
├── tools/
│   ├── IndexSourceTool.ts      # Universal indexing
│   ├── SearchContextTool.ts    # Vector search
│   ├── ListSourcesTool.ts      # List indexed sources
│   └── DeleteSourceTool.ts     # Remove sources
└── index.ts                    # MCP server entry point
```

### Building and Testing
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run the server (for testing)
npm start

# Test with MCP Inspector (optional)
npx @modelcontextprotocol/inspector dist/index.js
```

## Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Ensure `PINECONE_API_KEY` and `OPENAI_API_KEY` are set
   - Check variable names for typos

2. **"Failed to initialize Pinecone index"**
   - **API Key Issues**: Verify your Pinecone API key is valid and has permissions
   - **Plan Limitations**: Free tier users may need to upgrade to Starter plan for index creation
   - **Index Quota**: Check if you've reached your plan's index limit (free tier: 1 index, starter: 5 indexes)
   - **Existing Index**: If index exists with different dimensions (not 1536), delete it or use a different name
   - **Manual Creation**: Create the index manually in Pinecone console (see Pinecone Setup section)
   - **Environment Mismatch**: Ensure your Pinecone environment matches (defaults to us-east-1)
   
   **Common Error Messages**:
   - `"Index already exists"`: Use existing index or change `PINECONE_INDEX` name
   - `"Quota exceeded"`: Delete unused indexes or upgrade your Pinecone plan  
   - `"Invalid dimensions"`: Existing index has wrong dimensions, create with 1536
   - `"Environment not found"`: Check your `PINECONE_ENVIRONMENT` setting

3. **"GitHub rate limit exceeded"**
   - Add a `GITHUB_TOKEN` environment variable
   - Use personal access token for higher limits

4. **"No content found to index"**
   - Check URL accessibility
   - Verify include/exclude patterns
   - Ensure repository has supported file types

### Performance Tips

- Use `includePatterns` to focus on relevant files
- Set appropriate `maxFileSize` limits for large repositories
- Monitor Pinecone usage for cost control
- Use GitHub token for higher rate limits

## Contributing

This is an open-source project. Contributions are welcome!

## License

MIT License - see LICENSE file for details.