import { z } from 'zod';

// Source type detection and configuration
export type SourceType = 'github' | 'documentation';

// GitHub-related types
export interface GitHubUrlInfo {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
}

export interface GitHubFile {
  path: string;
  content: string;
  sha: string;
  size: number;
  language: string;
  downloadUrl: string;
}

export interface GitHubContent {
  url: string;
  repository: string;
  branch: string;
  files: GitHubFile[];
}

// Documentation-related types
export interface DocumentationPage {
  url: string;
  title: string;
  content: string;
  headings: string[];
  lastModified?: string;
  breadcrumbs: string[];
}

export interface DocumentationContent {
  url: string;
  pages: DocumentationPage[];
}

// Content processing types
export interface ContentChunk {
  id: string;
  content: string;
  type: 'code' | 'documentation' | 'readme';
  source: {
    url: string;
    type: SourceType;
    path?: string;
    title?: string;
  };
  metadata: {
    language?: string;
    size: number;
    hash: string;
    headingLevel?: number;
    section?: string;
    dependencies?: string[];
  };
  embedding?: number[];
}

// Processing options
export interface ProcessingOptions {
  includePatterns?: string[];
  excludePatterns?: string[];
  maxFileSize?: number;
  maxDepth?: number;
  onlyMainContent?: boolean;
  maxPages?: number;
}

// Vector store types
export interface Vector {
  id: string;
  values: number[];
  metadata: {
    content: string;
    type: string;
    sourceUrl: string;
    sourcePath?: string;
    sourceTitle?: string;
    language?: string;
    size: number;
    hash: string;
    headingLevel?: number;
    section?: string;
    dependencies?: string;
  };
}

export interface QueryResult {
  id: string;
  score: number;
  metadata: Vector['metadata'];
}

// Configuration types
export interface ScoutConfig {
  // Scout API configuration (SaaS mode)
  scout?: {
    apiKey: string;      // Scout API key (scout_abc123...)
    projectId: string;   // UUID of user's project
    apiUrl?: string;     // Default: https://api.scout.ai
  };
  
  // Direct API configuration (self-hosted mode)
  pinecone?: {
    apiKey: string;
    environment: string;
    indexName: string;
  };
  openai?: {
    apiKey: string;
    model?: string;
  };
  
  // Processing configuration (always required)
  processing: {
    maxFileSize: number;
    maxChunkSize: number;
    chunkOverlap: number;
    batchSize: number;
  };
  
  // GitHub configuration (optional)
  github?: {
    token?: string;
  };
}

// MCP Tool input schemas (Zod schemas for validation)
export const IndexSourceInputSchema = z.object({
  url: z.string().url().describe('GitHub repository URL or documentation URL'),
  sourceType: z.enum(['auto', 'github', 'documentation']).optional().default('auto').describe('Source type (auto-detect by default)'),
  branch: z.string().optional().default('main').describe('Git branch for GitHub repos'),
  includePatterns: z.array(z.string()).optional().describe('File patterns to include (e.g., ["*.ts", "*.js"])'),
  excludePatterns: z.array(z.string()).optional().describe('File patterns to exclude (e.g., ["node_modules/**"])'),
  maxFileSize: z.number().optional().default(1048576).describe('Maximum file size in bytes'),
  maxDepth: z.number().optional().default(3).describe('Maximum crawl depth for documentation'),
  onlyMainContent: z.boolean().optional().default(true).describe('Extract only main content for documentation')
});

export const SearchContextInputSchema = z.object({
  query: z.string().describe('Search query for finding relevant context'),
  maxResults: z.number().optional().default(10).describe('Maximum number of results to return'),
  sources: z.array(z.string()).optional().describe('Filter by specific source URLs/IDs'),
  includeCode: z.boolean().optional().default(true).describe('Include code snippets in results'),
  includeDoc: z.boolean().optional().default(true).describe('Include documentation in results'),
  threshold: z.number().min(0).max(1).optional().default(0.7).describe('Similarity threshold for results')
});

export const DeleteSourceInputSchema = z.object({
  sourceId: z.string().describe('ID of the source to delete from vector store')
});

// Inferred types from schemas
export type IndexSourceInput = z.infer<typeof IndexSourceInputSchema>;
export type SearchContextInput = z.infer<typeof SearchContextInputSchema>;
export type DeleteSourceInput = z.infer<typeof DeleteSourceInputSchema>;

// Source information for listing
export interface SourceInfo {
  id: string;
  url: string;
  type: SourceType;
  title: string;
  indexedAt: string;
  chunkCount: number;
  status: 'indexed' | 'indexing' | 'failed';
}

// Search context result
export interface SearchResult {
  content: string;
  source: {
    url: string;
    type: SourceType;
    path?: string;
    title?: string;
  };
  metadata: {
    language?: string;
    section?: string;
    headingLevel?: number;
  };
  score: number;
}

// Service interfaces for dependency injection
export interface IVectorStoreService {
  initialize(): Promise<void>;
  upsertVectors(vectors: Vector[]): Promise<void>;
  queryVectors(vector: number[], options?: {
    topK?: number;
    filter?: Record<string, any>;
    threshold?: number;
    includeMetadata?: boolean;
  }): Promise<QueryResult[]>;
  deleteVectors(ids: string[]): Promise<void>;
  deleteByFilter(filter: Record<string, any>): Promise<void>;
  getIndexStats(): Promise<{
    totalVectors: number;
    dimension: number;
    indexFullness: number;
  }>;
  listSources(): Promise<string[]>;
  healthCheck(): Promise<boolean>;
}

export interface IEmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  generateQueryEmbedding(query: string): Promise<number[]>;
  healthCheck(): Promise<boolean>;
  getModelInfo(): {
    model: string;
    dimensions: number;
    maxTokens: number;
  };
}

// Error types
export class ScoutError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ScoutError';
  }
}

export class GitHubError extends ScoutError {
  constructor(message: string, details?: any) {
    super(message, 'GITHUB_ERROR', details);
  }
}

export class VectorStoreError extends ScoutError {
  constructor(message: string, details?: any) {
    super(message, 'VECTOR_STORE_ERROR', details);
  }
}

export class EmbeddingError extends ScoutError {
  constructor(message: string, details?: any) {
    super(message, 'EMBEDDING_ERROR', details);
  }
}