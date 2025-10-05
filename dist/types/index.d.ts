import { z } from 'zod';
export type SourceType = 'github' | 'documentation';
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
export interface DocumentationPage {
    url: string;
    title: string;
    content: string;
    headings: string[];
    lastModified?: string;
    breadcrumbs: string[];
    markdown?: string;
}
export interface DocumentationContent {
    url: string;
    pages: DocumentationPage[];
}
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
export interface ProcessingOptions {
    includePatterns?: string[];
    excludePatterns?: string[];
    maxFileSize?: number;
    maxDepth?: number;
    onlyMainContent?: boolean;
    maxPages?: number;
}
export interface Vector {
    id: string;
    values: number[];
    metadata: {
        documentId?: string;
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
    values?: number[];
}
export interface ScoutConfig {
    processing: {
        maxFileSize: number;
        maxChunkSize: number;
        chunkOverlap: number;
        batchSize: number;
    };
    github?: {
        token?: string;
    };
}
export declare const IndexSourceInputSchema: z.ZodObject<{
    url: z.ZodString;
    sourceType: z.ZodDefault<z.ZodOptional<z.ZodEnum<["auto", "github", "documentation"]>>>;
    branch: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    includePatterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    excludePatterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    maxFileSize: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    maxDepth: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    onlyMainContent: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    tokensPerChunk: z.ZodOptional<z.ZodNumber>;
    scrapingBackend: z.ZodDefault<z.ZodOptional<z.ZodEnum<["playwright", "firecrawl"]>>>;
}, "strip", z.ZodTypeAny, {
    url: string;
    sourceType: "github" | "documentation" | "auto";
    branch: string;
    maxFileSize: number;
    maxDepth: number;
    onlyMainContent: boolean;
    scrapingBackend: "playwright" | "firecrawl";
    includePatterns?: string[] | undefined;
    excludePatterns?: string[] | undefined;
    tokensPerChunk?: number | undefined;
}, {
    url: string;
    sourceType?: "github" | "documentation" | "auto" | undefined;
    branch?: string | undefined;
    includePatterns?: string[] | undefined;
    excludePatterns?: string[] | undefined;
    maxFileSize?: number | undefined;
    maxDepth?: number | undefined;
    onlyMainContent?: boolean | undefined;
    tokensPerChunk?: number | undefined;
    scrapingBackend?: "playwright" | "firecrawl" | undefined;
}>;
export declare const SearchContextInputSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    sources: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    includeCode: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    includeDoc: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    threshold: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    minResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    oversample: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    strategy: z.ZodDefault<z.ZodOptional<z.ZodEnum<["precision", "balanced", "recall"]>>>;
    mmrLambda: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    maxPerSource: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    dedupe: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    lowerThresholdOnFewResults: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    topKCap: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    includeCode: boolean;
    includeDoc: boolean;
    threshold: number;
    minResults: number;
    oversample: number;
    strategy: "precision" | "balanced" | "recall";
    mmrLambda: number;
    maxPerSource: number;
    dedupe: boolean;
    lowerThresholdOnFewResults: boolean;
    topKCap: number;
    sources?: string[] | undefined;
}, {
    query: string;
    maxResults?: number | undefined;
    sources?: string[] | undefined;
    includeCode?: boolean | undefined;
    includeDoc?: boolean | undefined;
    threshold?: number | undefined;
    minResults?: number | undefined;
    oversample?: number | undefined;
    strategy?: "precision" | "balanced" | "recall" | undefined;
    mmrLambda?: number | undefined;
    maxPerSource?: number | undefined;
    dedupe?: boolean | undefined;
    lowerThresholdOnFewResults?: boolean | undefined;
    topKCap?: number | undefined;
}>;
export declare const DeleteSourceInputSchema: z.ZodObject<{
    sourceId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sourceId: string;
}, {
    sourceId: string;
}>;
export declare const FindSourcesInputSchema: z.ZodObject<{
    query: z.ZodString;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    github: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    research: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    mainContentOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    includeTags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    excludeTags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    github: boolean;
    query: string;
    limit: number;
    research: boolean;
    mainContentOnly: boolean;
    includeTags?: string[] | undefined;
    excludeTags?: string[] | undefined;
}, {
    query: string;
    github?: boolean | undefined;
    limit?: number | undefined;
    research?: boolean | undefined;
    mainContentOnly?: boolean | undefined;
    includeTags?: string[] | undefined;
    excludeTags?: string[] | undefined;
}>;
export declare const DeepResearchInputSchema: z.ZodObject<{
    query: z.ZodString;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    github: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    research: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    mainContentOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    includeTags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    excludeTags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    scrapingBackend: z.ZodDefault<z.ZodOptional<z.ZodEnum<["playwright", "firecrawl"]>>>;
}, "strip", z.ZodTypeAny, {
    github: boolean;
    scrapingBackend: "playwright" | "firecrawl";
    query: string;
    limit: number;
    research: boolean;
    mainContentOnly: boolean;
    includeTags?: string[] | undefined;
    excludeTags?: string[] | undefined;
}, {
    query: string;
    github?: boolean | undefined;
    scrapingBackend?: "playwright" | "firecrawl" | undefined;
    limit?: number | undefined;
    research?: boolean | undefined;
    mainContentOnly?: boolean | undefined;
    includeTags?: string[] | undefined;
    excludeTags?: string[] | undefined;
}>;
export type IndexSourceInput = z.infer<typeof IndexSourceInputSchema>;
export type SearchContextInput = z.infer<typeof SearchContextInputSchema>;
export type DeleteSourceInput = z.infer<typeof DeleteSourceInputSchema>;
export type FindSourcesInput = z.infer<typeof FindSourcesInputSchema>;
export type DeepResearchInput = z.infer<typeof DeepResearchInputSchema>;
export interface SourceInfo {
    id: string;
    url: string;
    type: SourceType;
    title: string;
    indexedAt: string;
    chunkCount: number;
    status: 'indexed' | 'indexing' | 'failed';
}
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
export interface IVectorStoreService {
    initialize(): Promise<void>;
    upsertVectors(vectors: Vector[]): Promise<void>;
    queryVectors(vector: number[], options?: {
        topK?: number;
        filter?: Record<string, any>;
        threshold?: number;
        includeMetadata?: boolean;
        includeValues?: boolean;
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
    createDocument(params: {
        name: string;
        type: 'github' | 'documentation' | 'local';
        source_url: string;
        source_metadata?: any;
    }): Promise<{
        id: string;
    }>;
    updateDocument(params: {
        id: string;
        status?: 'pending' | 'indexing' | 'indexed' | 'failed';
        chunk_count?: number;
        token_count?: number;
        error_message?: string;
        indexing_stage?: string;
    }): Promise<void>;
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
export declare class ScoutError extends Error {
    code: string;
    details?: any | undefined;
    constructor(message: string, code: string, details?: any | undefined);
}
export declare class GitHubError extends ScoutError {
    constructor(message: string, details?: any);
}
export declare class VectorStoreError extends ScoutError {
    constructor(message: string, details?: any);
}
export declare class EmbeddingError extends ScoutError {
    constructor(message: string, details?: any);
}
//# sourceMappingURL=index.d.ts.map