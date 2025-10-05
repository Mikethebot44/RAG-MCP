# RAG MCP Server (OSS)

RAG MCP is an open-source Model Context Protocol (MCP) server that connects coding agents to your own Retrieval Augmented Generation (RAG) stack. It performs source ingestion, chunking, embedding, and vector search using OpenAI embeddings and Pinecone as the vector database. No SaaS coupling; bring your own keys.

## Features

- **OpenAI + Pinecone**: Embeddings via OpenAI; storage and retrieval via Pinecone
- **Universal Source Indexing**: Index GitHub repos, documentation websites, and local folders/files
- **Smart Content Processing**: Language-aware chunking with configurable sizes, overlaps, and batching
- **MCP Integration**: Works out of the box with Claude Desktop, Cursor, and any other MCP-compatible client
- **CLI Utilities**: Guided setup, environment validation, and server management commands

## Architecture

- **Language**: TypeScript (ESM modules)
- **Embeddings**: OpenAI (`text-embedding-3-small` by default)
- **Vector Store**: Pinecone (serverless or dedicated)
- **Content Sources**: GitHub REST API, local filesystem, and HTML scraping via Playwright + Readability
- **Transport**: STDIO for MCP communication, optional HTTP mode for local testing

## Quick Start

### Prerequisites

You need the following before running the server:

- **OPENAI_API_KEY** - OpenAI API key
- **PINECONE_API_KEY** - Pinecone API key
- **PINECONE_INDEX** - Pinecone index name (pre-created)
- **GITHUB_TOKEN** (optional) - increases GitHub rate limits when indexing repositories
- **FIRECRAWL_API_KEY** (optional) - enables web search tools (`find_sources`, `deep_research`)

### Do I need to create the Pinecone index?

Yes. The MCP server expects an existing Pinecone index and will not create one automatically. Create a serverless index with the right dimensions and metric, then set `PINECONE_INDEX` to its name.

Recommended settings (for `text-embedding-3-small`):

- Dimension: 1536
- Metric: cosine
- Pods/replicas: serverless (on-demand)
- Cloud/Region: choose the closest to your workloads (e.g., AWS us-east-1)

Create via Pinecone Console:

1. Log in to Pinecone Console, go to Indexes ➜ Create Index
2. Name: your-index-name (use this for `PINECONE_INDEX`)
3. Dimensions: 1536
4. Metric: cosine
5. Deployment: Serverless, pick Cloud and Region
6. Create

Create via Node.js script (alternative):

```ts
import { Pinecone } from '@pinecone-database/pinecone'

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })
await pc.indexes.create({
  name: 'your-index-name',
  dimension: 1536,
  metric: 'cosine',
  spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
})
console.log('Index created')
```

If you use a different embedding model, set the index `dimension` to that model’s embedding size (e.g., `3072` for `text-embedding-3-large`) and adjust your config accordingly.

### Where to get API keys

- OpenAI API key: create at `https://platform.openai.com/api-keys`
- Pinecone API key: create at `https://app.pinecone.io/` under API Keys
- Firecrawl API key (optional): get from `https://www.firecrawl.dev/` after signing up
- GitHub token (optional, for higher rate limits/private repos):
  - Fine‑grained token: `https://github.com/settings/personal-access-tokens/new` → Select repositories (or All) → Permissions → Repository permissions → "Contents: Read‑only" and "Metadata: Read‑only" → Generate. Use the token as `GITHUB_TOKEN`.
  - Classic token (legacy): `https://github.com/settings/tokens/new` → scope `public_repo` (for public) or `repo` (private). Prefer fine‑grained.

### Installation

```bash
# Install globally (recommended)
npm install -g scout-mcp

# Or run on demand without installing
npx scout-mcp start
```

### Configure Environment Variables

Set these variables in your shell, .env file, or MCP client configuration:

```bash
# Required
export OPENAI_API_KEY="sk-..."
export PINECONE_API_KEY="pcn-..."
export PINECONE_INDEX="your-index"

# Optional
export GITHUB_TOKEN="ghp_xxx"                  # GitHub API token
export FIRECRAWL_API_KEY="fc_..."              # Enables find_sources/deep_research
export MAX_FILE_SIZE="1048576"                 # Bytes, default 1 MB
export CHUNK_SIZE="8192"                       # Characters per chunk
export CHUNK_OVERLAP="200"                     # Character overlap between chunks
export BATCH_SIZE="100"                        # Batch size for embeddings/upserts
```

## Run locally (development)

```bash
git clone https://github.com/terragon-labs/scout-mcp.git
cd RAG-MCP
npm install

# Set env vars (see above). On Windows PowerShell:
# $env:OPENAI_API_KEY="sk-..."; $env:PINECONE_API_KEY="pcn-..."; $env:PINECONE_INDEX="your-index"

# Build once
npm run build

# Run CLI directly
node dist/cli.js init
node dist/cli.js health
node dist/cli.js start --verbose

# Or watch-compile in one terminal
npm run dev
# ...and run the CLI from another terminal:
node dist/cli.js start --verbose
```

### MCP client configuration for local development

When running the server from your local working copy (using `node dist/cli.js start`), configure your MCP client to execute the local CLI and pass your environment variables.

Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "scout-mcp": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO>/RAG-MCP/dist/cli.js", "start"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "PINECONE_API_KEY": "${PINECONE_API_KEY}",
        "PINECONE_INDEX": "${PINECONE_INDEX}",
        "GITHUB_TOKEN": "${GITHUB_TOKEN}",
        "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}"
      }
    }
  }
}
```

Claude Desktop (`settings.json`):

```json
{
  "mcpServers": {
    "scout-mcp": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO>/RAG-MCP/dist/cli.js", "start"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "PINECONE_API_KEY": "${PINECONE_API_KEY}",
        "PINECONE_INDEX": "${PINECONE_INDEX}",
        "GITHUB_TOKEN": "${GITHUB_TOKEN}",
        "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}"
      }
    }
  }
}
```

Notes

- Replace `<ABSOLUTE_PATH_TO>` with the full path to your cloned `RAG-MCP` directory.
- Ensure you’ve run `npm run build` so `dist/cli.js` exists.
- On Windows, you can also run through PowerShell: `node .\\dist\\cli.js start`.
- If using the published package instead of local build, you can keep using `"command": "npx", "args": ["scout-mcp", "start"]`.

### Start the Server

```bash
# One-time setup guidance
npx scout-mcp init

# Verify configuration
npx scout-mcp health

# Launch the MCP server (STDIO mode)
npx scout-mcp start

# Launch with verbose logging or HTTP mode if needed
npx scout-mcp start --verbose
npx scout-mcp start --http --port 3333
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "scout-mcp": {
      "command": "npx",
      "args": ["scout-mcp", "start"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "PINECONE_API_KEY": "${PINECONE_API_KEY}",
        "PINECONE_INDEX": "${PINECONE_INDEX}",
        "GITHUB_TOKEN": "${GITHUB_TOKEN}",
        "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}"
      }
    }
  }
}
```

## CLI Commands

| Command | Description |
| --- | --- |
| `npx scout-mcp init` | Print setup instructions and Claude configuration snippet |
| `npx scout-mcp health` | Validate required/optional environment variables |
| `npx scout-mcp start` | Start the MCP server (STDIO by default) |
| `npx scout-mcp start --http` | Start an HTTP server for local testing |
| `npx scout-mcp start --verbose` | Enable verbose logging |
| `npx scout-mcp version` | Display version and runtime info |

## MCP Tools

The server exposes these MCP tools when connected to a client:

- **`search_context`** - Perform similarity search against indexed content and return ranked context with source attribution
- **`list_sources`** - List indexed sources with metadata and statistics
- **`find_sources`** - Discover relevant source URLs on the web for a query (uses Firecrawl if API key provided)
- **`deep_research`** - Runs Firecrawl search and returns candidate URLs you can pass to `index_source`
- **`scrape_page`** - Scrape a single web page and return markdown content
- **`index_source`** - Index a GitHub repository or documentation website
- **`index_local`** - Index a local directory or a single file
- **`delete_source`** - Delete all vectors for a given source URL/ID

## Environment Variable Reference

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key used for embeddings |
| `PINECONE_API_KEY` | Yes | - | Pinecone API key |
| `PINECONE_INDEX` | Yes | - | Pinecone index name |
| `FIRECRAWL_API_KEY` | No | - | Enables Firecrawl-backed web search tools |
| `GITHUB_TOKEN` | No | - | GitHub token for higher rate limits |
| `MAX_FILE_SIZE` | No | `1048576` | Maximum file size to download (bytes) |
| `CHUNK_SIZE` | No | `8192` | Maximum characters per chunk |
| `CHUNK_OVERLAP` | No | `200` | Overlap between consecutive chunks |
| `BATCH_SIZE` | No | `100` | Batch size for embedding generation and upserts |

## Project Structure

```
src/
|- cli.ts                           # Command line interface (init, health, start)
|- index.ts                         # STDIO entry point for MCP clients
|- server.ts                        # Shared server logic (STDIO/HTTP)
|- services/
|  |- OpenAIEmbeddingService.ts     # Embedding operations via OpenAI API
|  |- PineconeVectorStoreService.ts # Vector operations via Pinecone
|  |- SourceRegistryService.ts      # Local JSON registry for sources
|  |- ContentProcessor.ts           # Chunking and metadata extraction
|  |- GitHubService.ts              # GitHub fetching utilities
|  |- WebScrapingService.ts         # Documentation crawler using Playwright
|- tools/                           # MCP tool implementations
|- types/                           # Shared types and schemas
```

## Troubleshooting

| Issue | What to check |
| --- | --- |
| `Missing required environment variables` | Ensure `OPENAI_API_KEY`, `PINECONE_API_KEY`, and `PINECONE_INDEX` are set |
| Pinecone errors | Confirm the index exists and your API key has access |
| Search returns nothing | Verify sources are indexed: run `list_sources` and confirm chunk counts |
| GitHub rate limits reached | Supply `GITHUB_TOKEN` or retry after the limit resets |

Enable verbose logging with `npx scout-mcp start --verbose` to see health-check results.

## Contributing

1. Fork the repository and clone locally
2. Install dependencies with `npm install`
3. Set required env vars (see Run locally) so health checks pass
4. Develop in `src/`; use `npm run dev` for TypeScript watch
5. Use `node dist/cli.js start --verbose` to run the MCP server locally
6. Ensure `npm run build` passes and README stays accurate
7. Open a pull request with a concise description and testing notes

## License

MIT (c) Terragon Labs
