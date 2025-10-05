import { DocumentationContent, ProcessingOptions } from '../types/index.js';
export declare class WebScrapingService {
    private browser;
    private userAgent;
    constructor();
    /**
     * Initialize the browser for web scraping
     */
    initialize(): Promise<void>;
    /**
     * Close browser and cleanup
     */
    cleanup(): Promise<void>;
    /**
     * Process documentation from a URL
     */
    processDocumentation(baseUrl: string, options?: ProcessingOptions): Promise<DocumentationContent>;
    /**
     * Scrape a single page
     */
    private scrapePage;
    /**
     * Extract main content using readability
     */
    private extractMainContent;
    /**
     * Extract content by common selectors
     */
    private extractContentBySelectors;
    /**
     * Extract all content (less selective)
     */
    private extractAllContent;
    private extractMarkdownFromHtml;
    /**
     * Clean extracted content
     */
    private cleanContent;
    /**
     * Extract headings from HTML
     */
    private extractHeadings;
    /**
     * Extract internal links from content
     */
    private extractInternalLinks;
    /**
     * Check if URL is relevant for documentation crawling
     */
    private isRelevantDocumentationUrl;
    /**
     * Extract title from URL as fallback
     */
    private extractTitleFromUrl;
    /**
     * Extract breadcrumbs from URL path
     */
    private extractBreadcrumbs;
    /**
     * Get last modified date from page
     */
    private getLastModified;
    /**
     * Health check for web scraping service
     */
    healthCheck(): Promise<boolean>;
    /**
     * Get robots.txt for a domain
     */
    getRobotsTxt(baseUrl: string): Promise<string | null>;
    /**
     * Check if URL is allowed by robots.txt
     */
    isAllowedByRobots(url: string, userAgent?: string): Promise<boolean>;
}
//# sourceMappingURL=WebScrapingService.d.ts.map