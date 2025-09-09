# OpenRAG MCP Server

An open-source Model Context Protocol (MCP) server that provides RAG-enhanced context to coding agents via vector search. Built as an alternative to proprietary solutions, OpenRAG gives developers control over their vector storage and indexing.

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

### Installation

1. **Clone and build**:
   ```bash
   git clone <repository-url>
   cd openrag-mcp
   npm install
   npm run build
   ```

2. **Set environment variables**:
   ```bash
   # Required
   export PINECONE_API_KEY="your_pinecone_key"
   export OPENAI_API_KEY="your_openai_key"
   
   # Optional
   export PINECONE_ENVIRONMENT="us-east-1"  # Default
   export PINECONE_INDEX="openrag-index"    # Default
   export GITHUB_TOKEN="your_github_token"  # For higher rate limits
   export MAX_FILE_SIZE="1048576"           # 1MB default
   export CHUNK_SIZE="8192"                 # Default chunk size
   ```

3. **Configure Claude Desktop** (add to your MCP settings):
   ```json
   {
     "mcpServers": {
       "openrag": {
         "command": "node",
         "args": ["/path/to/openrag-mcp/dist/index.js"],
         "env": {
           "PINECONE_API_KEY": "${PINECONE_API_KEY}",
           "OPENAI_API_KEY": "${OPENAI_API_KEY}",
           "GITHUB_TOKEN": "${GITHUB_TOKEN}"
         }
       }
     }
   }
   ```

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
| `PINECONE_INDEX` | ❌ | openrag-index | Pinecone index name |
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
   - Verify your Pinecone API key is valid
   - Check if index already exists with different dimensions
   - Ensure you have quota for creating indexes

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