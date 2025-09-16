# Scout MCP Server

Scout MCP is an open-source Model Context Protocol (MCP) server that connects coding agents to your Scout project for Retrieval Augmented Generation (RAG). It handles source ingestion, chunking, embeddings, and vector search by delegating storage and compute to the Scout API.

## Features

- **Scout-Native Vector Search**: All indexing and search operations run through the Scout API using your project credentials
- **Universal Source Indexing**: Index GitHub repositories and documentation websites with a single command
- **Smart Content Processing**: Language-aware chunking with configurable sizes, overlaps, and batching
- **MCP Integration**: Works out of the box with Claude Desktop, Cursor, and any other MCP-compatible client
- **CLI Utilities**: Guided setup, environment validation, and server management commands

## Architecture

- **Language**: TypeScript (ESM modules)
- **Embeddings & Vector Store**: Managed by the Scout API for your configured project
- **Content Sources**: GitHub REST API and HTML scraping via Playwright + Readability
- **Transport**: STDIO for MCP communication, optional HTTP mode for local testing

## Quick Start

### Prerequisites

You need the following before running the server:

- **SCOUT_API_KEY** - personal API key from your Scout account
- **SCOUT_PROJECT_ID** - UUID for the Scout project you want to populate
- **GITHUB_TOKEN** (optional) - increases GitHub rate limits when indexing repositories

> Need an API key? Visit your Scout dashboard and create one, then copy the project ID from the project settings page.

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
export SCOUT_API_KEY="scout_xxx"
export SCOUT_PROJECT_ID="00000000-0000-0000-0000-000000000000"

# Optional
export SCOUT_API_URL="https://api.scout.ai"    # Override the default base URL
export GITHUB_TOKEN="ghp_xxx"                  # GitHub API token
export MAX_FILE_SIZE="1048576"                 # Bytes, default 1 MB
export CHUNK_SIZE="8192"                       # Characters per chunk
export CHUNK_OVERLAP="200"                     # Character overlap between chunks
export BATCH_SIZE="100"                        # Batch size for embeddings/upserts
```

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
        "SCOUT_API_KEY": "${SCOUT_API_KEY}",
        "SCOUT_PROJECT_ID": "${SCOUT_PROJECT_ID}",
        "SCOUT_API_URL": "${SCOUT_API_URL}",
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
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

The server exposes four MCP tools when connected to a client:

- **`index_source`** - Ingest a GitHub repository or documentation site and push processed chunks to Scout
- **`search_context`** - Perform similarity search against indexed content to retrieve relevant context snippets
- **`list_sources`** - Enumerate sources that have been indexed in the current Scout project
- **`delete_source`** - Remove an indexed source by ID

Each tool automatically delegates vector storage, updates, and queries to the Scout API based on the provided `SCOUT_PROJECT_ID`.

## Environment Variable Reference

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SCOUT_API_KEY` | Yes | - | Scout API key used for authentication |
| `SCOUT_PROJECT_ID` | Yes | - | Target Scout project UUID |
| `SCOUT_API_URL` | No | `https://scout-mauve-nine.vercel.app` | Override base URL for self-hosted Scout deployments |
| `GITHUB_TOKEN` | No | - | GitHub token for higher rate limits |
| `MAX_FILE_SIZE` | No | `1048576` | Maximum file size to download (bytes) |
| `CHUNK_SIZE` | No | `8192` | Maximum characters per chunk |
| `CHUNK_OVERLAP` | No | `200` | Overlap between consecutive chunks |
| `BATCH_SIZE` | No | `100` | Batch size for embedding generation and upserts |

## Project Structure

```
src/
|- cli.ts                    # Command line interface (init, health, start)
|- index.ts                  # STDIO entry point for MCP clients
|- server.ts                 # Shared server logic (STDIO/HTTP)
|- services/
|  |- ScoutVectorStoreService.ts  # Vector operations via Scout API
|  |- ScoutEmbeddingService.ts    # Embedding operations via Scout API
|  |- ContentProcessor.ts         # Chunking and metadata extraction
|  |- GitHubService.ts            # GitHub fetching utilities
|  |- WebScrapingService.ts       # Documentation crawler using Playwright
|- tools/                        # MCP tool implementations
|- types/                        # Shared types and schemas
```

## Troubleshooting

| Issue | What to check |
| --- | --- |
| `Missing required environment variables` | Ensure `SCOUT_API_KEY` and `SCOUT_PROJECT_ID` are exported or set in your MCP client configuration |
| `401 Unauthorized` errors from Scout | Confirm the API key has access to the project ID you configured |
| Indexing succeeds but search returns nothing | Verify the project in the Scout dashboard to confirm documents were added and embeddings completed |
| GitHub rate limits reached | Supply `GITHUB_TOKEN` or retry after the limit resets |

Enable verbose logging with `npx scout-mcp start --verbose` to see health-check results and Scout API responses.

## Contributing

1. Fork the repository and clone locally
2. Install dependencies with `npm install`
3. Make your changes in `src/`
4. Run `npm run build` to compile TypeScript
5. Open a pull request describing your changes

## License

MIT (c) Terragon Labs
