import { ContentChunk, GitHubContent, DocumentationContent, ScoutConfig } from '../types/index.js';
export declare class ContentProcessor {
    private maxChunkSize;
    private chunkOverlap;
    constructor(config: ScoutConfig);
    /**
     * Process GitHub repository content into chunks
     */
    processGitHubContent(content: GitHubContent): ContentChunk[];
    /**
     * Process documentation content into chunks
     */
    processDocumentationContent(content: DocumentationContent): ContentChunk[];
    /**
     * Chunk a GitHub file based on its type and content
     */
    private chunkGitHubFile;
    /**
     * Chunk a documentation page
     */
    private chunkDocumentationPage;
    /**
     * Chunk code content intelligently
     */
    private chunkCodeContent;
    /**
     * Chunk by code structure (functions, classes, etc.)
     */
    private chunkByCodeStructure;
    /**
     * Add a code chunk with proper metadata
     */
    private addCodeChunk;
    /**
     * Chunk text content by semantic breaks
     */
    private chunkTextContent;
    /**
     * Chunk markdown content by headings
     */
    private chunkMarkdownContent;
    /**
     * Chunk documentation by headings
     */
    private chunkByHeadings;
    /**
     * Chunk by lines (fallback method)
     */
    private chunkByLines;
    /**
     * Create a text chunk
     */
    private createTextChunk;
    /**
     * Split long text into chunks
     */
    private splitLongText;
    /**
     * Find natural break point for lines
     */
    private findNaturalBreakPoint;
    /**
     * Find text break point
     */
    private findTextBreakPoint;
    /**
     * Determine file type
     */
    private determineFileType;
    /**
     * Check if file is a code file
     */
    private isCodeFile;
    /**
     * Check if language supports structural chunking
     */
    private supportsStructuralChunking;
    /**
     * Check if line is start of a structure
     */
    private isStructureStart;
    /**
     * Check if line is start of a function
     */
    private isFunctionStart;
    /**
     * Check if line is start of a class
     */
    private isClassStart;
    /**
     * Extract dependencies from code
     */
    private extractDependencies;
    /**
     * Generate unique chunk ID
     */
    private generateChunkId;
    /**
     * Generate content hash
     */
    private generateContentHash;
}
//# sourceMappingURL=ContentProcessor.d.ts.map