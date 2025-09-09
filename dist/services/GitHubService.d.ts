import { GitHubUrlInfo, GitHubContent, ProcessingOptions, OpenRAGConfig } from '../types/index.js';
export declare class GitHubService {
    private octokit;
    private rateLimit;
    constructor(config: OpenRAGConfig);
    /**
     * Parse GitHub URL to extract repository information
     */
    parseGitHubUrl(url: string): GitHubUrlInfo;
    /**
     * Process a GitHub repository and return structured content
     */
    processRepository(url: string, options?: ProcessingOptions): Promise<GitHubContent>;
    /**
     * Get repository information
     */
    private getRepositoryInfo;
    /**
     * Get repository content recursively
     */
    private getRepositoryContent;
    /**
     * Process directory listing recursively
     */
    private processDirectoryListing;
    /**
     * Process a single file
     */
    private processFile;
    /**
     * Download file content from GitHub
     */
    private getFileContent;
    /**
     * Check if file should be included based on patterns
     */
    private shouldIncludeFile;
    /**
     * Check if directory should be excluded
     */
    private isExcludedDirectory;
    /**
     * Simple glob pattern matching
     */
    private matchesPattern;
    /**
     * Detect programming language from filename
     */
    private detectLanguage;
    /**
     * Simple check for binary content
     */
    private isBinaryContent;
    /**
     * Check GitHub API rate limit
     */
    private checkRateLimit;
    /**
     * Update rate limit info from response headers
     */
    private updateRateLimit;
    /**
     * Get current rate limit status
     */
    getRateLimitStatus(): Promise<{
        remaining: number;
        limit: number;
        reset: Date;
    }>;
    /**
     * Health check for GitHub service
     */
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=GitHubService.d.ts.map