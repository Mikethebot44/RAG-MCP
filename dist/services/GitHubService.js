import { Octokit } from '@octokit/rest';
import { GitHubError } from '../types/index.js';
export class GitHubService {
    octokit;
    rateLimit = { remaining: 5000, reset: new Date() };
    constructor(config) {
        this.octokit = new Octokit({
            auth: config.github?.token, // Optional token for higher rate limits
            userAgent: 'OpenRAG-MCP/1.0.0'
        });
    }
    /**
     * Parse GitHub URL to extract repository information
     */
    parseGitHubUrl(url) {
        const patterns = [
            // https://github.com/owner/repo
            /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/?$/,
            // https://github.com/owner/repo/tree/branch
            /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/?$/,
            // https://github.com/owner/repo/tree/branch/path
            /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)$/,
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return {
                    owner: match[1],
                    repo: match[2].replace(/\.git$/, ''), // Remove .git suffix if present
                    branch: match[3] || 'main',
                    path: match[4] || ''
                };
            }
        }
        throw new GitHubError(`Invalid GitHub URL format: ${url}`);
    }
    /**
     * Process a GitHub repository and return structured content
     */
    async processRepository(url, options = {}) {
        const urlInfo = this.parseGitHubUrl(url);
        try {
            // Verify repository exists and get default branch
            const repoInfo = await this.getRepositoryInfo(urlInfo.owner, urlInfo.repo);
            const branch = urlInfo.branch === 'main' ? repoInfo.default_branch : urlInfo.branch;
            // Get file tree
            const files = await this.getRepositoryContent(urlInfo.owner, urlInfo.repo, urlInfo.path, branch, options);
            return {
                url,
                repository: `${urlInfo.owner}/${urlInfo.repo}`,
                branch,
                files
            };
        }
        catch (error) {
            if (error instanceof GitHubError) {
                throw error;
            }
            throw new GitHubError(`Failed to process repository: ${error instanceof Error ? error.message : 'Unknown error'}`, { url, urlInfo, error });
        }
    }
    /**
     * Get repository information
     */
    async getRepositoryInfo(owner, repo) {
        await this.checkRateLimit();
        try {
            const { data } = await this.octokit.rest.repos.get({
                owner,
                repo
            });
            this.updateRateLimit(this.octokit.rest.repos.get.endpoint.DEFAULTS.headers);
            return data;
        }
        catch (error) {
            if (error.status === 404) {
                throw new GitHubError(`Repository ${owner}/${repo} not found or is private`);
            }
            if (error.status === 403) {
                throw new GitHubError(`Access denied to repository ${owner}/${repo}. Check permissions or provide a GitHub token.`);
            }
            throw new GitHubError(`Failed to get repository info: ${error.message}`, { owner, repo, status: error.status });
        }
    }
    /**
     * Get repository content recursively
     */
    async getRepositoryContent(owner, repo, path = '', branch, options) {
        await this.checkRateLimit();
        try {
            const { data } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path,
                ref: branch
            });
            this.updateRateLimit(this.octokit.rest.repos.getContent.endpoint.DEFAULTS.headers);
            if (Array.isArray(data)) {
                // Directory listing
                return await this.processDirectoryListing(data, owner, repo, branch, options);
            }
            else if (data.type === 'file') {
                // Single file
                const file = await this.processFile(data, options);
                return file ? [file] : [];
            }
            else {
                // Submodule or other type - skip
                return [];
            }
        }
        catch (error) {
            if (error.status === 404) {
                console.warn(`Path not found: ${path}`);
                return [];
            }
            throw new GitHubError(`Failed to get repository content: ${error.message}`, { owner, repo, path, branch, status: error.status });
        }
    }
    /**
     * Process directory listing recursively
     */
    async processDirectoryListing(items, owner, repo, branch, options) {
        const files = [];
        const directories = [];
        // Separate files and directories
        for (const item of items) {
            if (item.type === 'file') {
                if (this.shouldIncludeFile(item.name, options)) {
                    const file = await this.processFile(item, options);
                    if (file) {
                        files.push(file);
                    }
                }
            }
            else if (item.type === 'dir' && !this.isExcludedDirectory(item.name, options)) {
                directories.push(item.path);
            }
        }
        // Process subdirectories
        for (const dirPath of directories) {
            const subFiles = await this.getRepositoryContent(owner, repo, dirPath, branch, options);
            files.push(...subFiles);
        }
        return files;
    }
    /**
     * Process a single file
     */
    async processFile(fileData, options) {
        // Check file size
        if (fileData.size > (options.maxFileSize || 1048576)) {
            console.warn(`Skipping large file: ${fileData.path} (${fileData.size} bytes)`);
            return null;
        }
        try {
            // Get file content
            const content = await this.getFileContent(fileData.download_url);
            return {
                path: fileData.path,
                content,
                sha: fileData.sha,
                size: fileData.size,
                language: this.detectLanguage(fileData.name),
                downloadUrl: fileData.download_url
            };
        }
        catch (error) {
            console.warn(`Failed to fetch file content for ${fileData.path}:`, error);
            return null;
        }
    }
    /**
     * Download file content from GitHub
     */
    async getFileContent(downloadUrl) {
        try {
            const response = await fetch(downloadUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const content = await response.text();
            // Check if content is binary (simple heuristic)
            if (this.isBinaryContent(content)) {
                throw new Error('Binary content detected');
            }
            return content;
        }
        catch (error) {
            throw new GitHubError(`Failed to download file content: ${error instanceof Error ? error.message : 'Unknown error'}`, { downloadUrl, error });
        }
    }
    /**
     * Check if file should be included based on patterns
     */
    shouldIncludeFile(filename, options) {
        const { includePatterns, excludePatterns } = options;
        // Check exclude patterns first
        if (excludePatterns && excludePatterns.length > 0) {
            for (const pattern of excludePatterns) {
                if (this.matchesPattern(filename, pattern)) {
                    return false;
                }
            }
        }
        // Check include patterns
        if (includePatterns && includePatterns.length > 0) {
            return includePatterns.some(pattern => this.matchesPattern(filename, pattern));
        }
        // Default: include common code files, exclude common non-code files
        const codeExtensions = [
            '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h',
            '.cs', '.php', '.rb', '.go', '.rs', '.kt', '.swift', '.scala',
            '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.xml',
            '.css', '.scss', '.sass', '.less', '.html', '.vue', '.svelte'
        ];
        const excludeExtensions = [
            '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf',
            '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.dylib'
        ];
        const ext = '.' + filename.split('.').pop()?.toLowerCase();
        if (excludeExtensions.includes(ext)) {
            return false;
        }
        return codeExtensions.includes(ext) || filename === 'README' || filename === 'LICENSE';
    }
    /**
     * Check if directory should be excluded
     */
    isExcludedDirectory(dirname, options) {
        const defaultExcludes = [
            'node_modules', '.git', '.svn', '.hg', 'build', 'dist',
            'target', 'bin', 'obj', '.vscode', '.idea', '__pycache__',
            '.pytest_cache', 'coverage', '.nyc_output'
        ];
        if (defaultExcludes.includes(dirname)) {
            return true;
        }
        if (options.excludePatterns) {
            return options.excludePatterns.some(pattern => this.matchesPattern(dirname, pattern));
        }
        return false;
    }
    /**
     * Simple glob pattern matching
     */
    matchesPattern(filename, pattern) {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\*\*/g, '.*') // ** matches anything
            .replace(/\*/g, '[^/]*') // * matches anything except /
            .replace(/\?/g, '.') // ? matches single character
            .replace(/\./g, '\\.'); // Escape dots
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(filename);
    }
    /**
     * Detect programming language from filename
     */
    detectLanguage(filename) {
        const ext = filename.split('.').pop()?.toLowerCase();
        const languageMap = {
            'ts': 'typescript',
            'tsx': 'typescript',
            'js': 'javascript',
            'jsx': 'javascript',
            'py': 'python',
            'java': 'java',
            'cpp': 'cpp',
            'cc': 'cpp',
            'cxx': 'cpp',
            'c': 'c',
            'h': 'c',
            'cs': 'csharp',
            'php': 'php',
            'rb': 'ruby',
            'go': 'go',
            'rs': 'rust',
            'kt': 'kotlin',
            'swift': 'swift',
            'scala': 'scala',
            'md': 'markdown',
            'json': 'json',
            'yaml': 'yaml',
            'yml': 'yaml',
            'toml': 'toml',
            'xml': 'xml',
            'html': 'html',
            'css': 'css',
            'scss': 'scss',
            'sass': 'sass',
            'less': 'less'
        };
        return languageMap[ext || ''] || 'text';
    }
    /**
     * Simple check for binary content
     */
    isBinaryContent(content) {
        // Check for null bytes which are common in binary files
        return content.includes('\0') || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(content.substring(0, 1000));
    }
    /**
     * Check GitHub API rate limit
     */
    async checkRateLimit() {
        if (this.rateLimit.remaining <= 10 && new Date() < this.rateLimit.reset) {
            const waitTime = this.rateLimit.reset.getTime() - Date.now();
            console.warn(`Rate limit approaching. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
            await new Promise(resolve => setTimeout(resolve, waitTime + 1000));
        }
    }
    /**
     * Update rate limit info from response headers
     */
    updateRateLimit(headers) {
        if (headers && headers['x-ratelimit-remaining']) {
            this.rateLimit.remaining = parseInt(headers['x-ratelimit-remaining']);
            this.rateLimit.reset = new Date(parseInt(headers['x-ratelimit-reset']) * 1000);
        }
    }
    /**
     * Get current rate limit status
     */
    async getRateLimitStatus() {
        try {
            const { data } = await this.octokit.rest.rateLimit.get();
            return {
                remaining: data.rate.remaining,
                limit: data.rate.limit,
                reset: new Date(data.rate.reset * 1000)
            };
        }
        catch (error) {
            // Fallback to cached values
            return {
                remaining: this.rateLimit.remaining,
                limit: 5000,
                reset: this.rateLimit.reset
            };
        }
    }
    /**
     * Health check for GitHub service
     */
    async healthCheck() {
        try {
            await this.octokit.rest.rateLimit.get();
            return true;
        }
        catch (error) {
            console.error('GitHub service health check failed:', error);
            return false;
        }
    }
}
//# sourceMappingURL=GitHubService.js.map