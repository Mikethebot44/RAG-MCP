export class SearchContextTool {
    embeddingService;
    vectorStoreService;
    // Small in-memory cache for query embeddings
    static embeddingCache = new Map();
    static maxCacheEntries = 256;
    constructor(embeddingService, vectorStoreService) {
        this.embeddingService = embeddingService;
        this.vectorStoreService = vectorStoreService;
    }
    /**
     * Get tool definition for MCP
     */
    getToolDefinition() {
        return {
            name: 'search_context',
            description: 'Search indexed sources for relevant context based on a query. Returns ranked results with source attribution.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query for finding relevant context'
                    },
                    maxResults: {
                        type: 'number',
                        default: 10,
                        description: 'Maximum number of results to return'
                    },
                    sources: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Filter by specific source URLs/IDs'
                    },
                    includeCode: {
                        type: 'boolean',
                        default: true,
                        description: 'Include code snippets in results'
                    },
                    includeDoc: {
                        type: 'boolean',
                        default: true,
                        description: 'Include documentation in results'
                    },
                    threshold: {
                        type: 'number',
                        minimum: 0,
                        maximum: 1,
                        default: 0.7,
                        description: 'Similarity threshold for results'
                    }
                },
                required: ['query']
            }
        };
    }
    /**
     * Execute the search operation
     */
    async execute(input) {
        const startTime = Date.now();
        try {
            console.log(`Searching for: "${input.query}"`);
            // Generate (or fetch cached) query embedding
            const normalizedQuery = input.query.trim().toLowerCase().replace(/\s+/g, ' ');
            let queryEmbedding = SearchContextTool.embeddingCache.get(normalizedQuery);
            if (!queryEmbedding) {
                queryEmbedding = await this.embeddingService.generateQueryEmbedding(normalizedQuery);
                // LRU-ish eviction
                if (SearchContextTool.embeddingCache.size >= SearchContextTool.maxCacheEntries) {
                    const firstKey = SearchContextTool.embeddingCache.keys().next().value;
                    if (firstKey)
                        SearchContextTool.embeddingCache.delete(firstKey);
                }
                SearchContextTool.embeddingCache.set(normalizedQuery, queryEmbedding);
            }
            // Build filter for vector search
            const filter = this.buildSearchFilter(input);
            // Perform vector similarity search with adaptive retrieval
            const baseMaxResults = input.maxResults || 10;
            const oversample = Math.max(1, input.oversample ?? 5);
            const topKCap = Math.max(baseMaxResults, input.topKCap ?? 100);
            const topK = Math.min(baseMaxResults * oversample, topKCap);
            const minResults = Math.max(1, input.minResults ?? 5);
            const allowAdaptive = input.lowerThresholdOnFewResults !== false;
            // Single oversampled query with threshold 0 (we'll filter locally)
            const vectorResults = await this.vectorStoreService.queryVectors(queryEmbedding, {
                topK,
                threshold: 0,
                filter,
                includeMetadata: true,
                includeValues: true
            });
            // Local adaptive thresholding
            const thresholds = [input.threshold ?? 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];
            let cutoff = thresholds[0];
            let filteredVectors = vectorResults.filter(r => (r.score ?? 0) >= cutoff);
            if (allowAdaptive && filteredVectors.length < minResults) {
                for (const t of thresholds.slice(1)) {
                    cutoff = t;
                    filteredVectors = vectorResults.filter(r => (r.score ?? 0) >= cutoff);
                    if (filteredVectors.length >= Math.min(minResults, baseMaxResults))
                        break;
                }
            }
            if (filteredVectors.length === 0) {
                filteredVectors = vectorResults.slice(0, baseMaxResults);
            }
            // Convert vector results to search results
            const searchResults = this.convertToSearchResults(filteredVectors, input);
            // MMR re-ranking when vector values are available; fallback to existing strategy otherwise
            let rankedResults;
            const haveValues = filteredVectors.every(v => Array.isArray(v.values) && v.values.length > 0);
            if (haveValues) {
                const k = Math.min(baseMaxResults, searchResults.length);
                const lambda = Math.max(0, Math.min(1, input.mmrLambda ?? 0.5));
                const selectedIdxs = this.maximalMarginalRelevance(filteredVectors.map(v => v.values), queryEmbedding, lambda, k);
                rankedResults = selectedIdxs.map(i => searchResults[i]);
            }
            else {
                rankedResults = this.rankAndDiversifyResults(searchResults, input.query);
            }
            const searchTime = Date.now() - startTime;
            if (rankedResults.length === 0) {
                return {
                    success: true,
                    message: 'No relevant results found. Try adjusting your query or lowering the similarity threshold.',
                    results: [],
                    totalResults: 0,
                    searchTime
                };
            }
            return {
                success: true,
                message: `Found ${rankedResults.length} relevant results`,
                results: rankedResults,
                totalResults: rankedResults.length,
                searchTime
            };
        }
        catch (error) {
            console.error('Error searching context:', error);
            const searchTime = Date.now() - startTime;
            const errorMessage = error instanceof Error
                ? error.message
                : 'Unknown error occurred during search';
            return {
                success: false,
                message: `Search failed: ${errorMessage}`,
                searchTime
            };
        }
    }
    // Compute cosine similarity between two vectors
    cosine(a, b) {
        let dot = 0, na = 0, nb = 0;
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        if (na === 0 || nb === 0)
            return 0;
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }
    // Return indices of selected items using MMR
    maximalMarginalRelevance(candidates, query, lambda, k) {
        const selected = [];
        const unused = new Set(candidates.map((_, i) => i));
        const relScores = candidates.map(v => this.cosine(v, query));
        while (selected.length < Math.min(k, candidates.length)) {
            let bestIdx = -1;
            let bestScore = -Infinity;
            for (const i of unused) {
                const relevance = relScores[i];
                let redundancy = 0;
                if (selected.length > 0) {
                    redundancy = Math.max(...selected.map(j => this.cosine(candidates[i], candidates[j])));
                }
                const score = lambda * relevance - (1 - lambda) * redundancy;
                if (score > bestScore) {
                    bestScore = score;
                    bestIdx = i;
                }
            }
            if (bestIdx === -1)
                break;
            selected.push(bestIdx);
            unused.delete(bestIdx);
        }
        return selected;
    }
    /**
     * Build search filter based on input parameters
     */
    buildSearchFilter(input) {
        const filter = {};
        // Filter by source URLs if specified
        if (input.sources && input.sources.length > 0) {
            filter.sourceUrl = { $in: input.sources };
        }
        // Filter by content type
        const includeTypes = [];
        if (input.includeCode !== false) {
            includeTypes.push('code', 'readme');
        }
        if (input.includeDoc !== false) {
            includeTypes.push('documentation');
        }
        if (includeTypes.length > 0) {
            filter.type = { $in: includeTypes };
        }
        return filter;
    }
    /**
     * Convert vector results to search results
     */
    convertToSearchResults(vectorResults, input) {
        return vectorResults.map(result => ({
            content: result.metadata.content,
            source: {
                url: result.metadata.sourceUrl,
                type: result.metadata.type === 'code' || result.metadata.type === 'readme' ? 'github' : 'documentation',
                path: result.metadata.sourcePath,
                title: result.metadata.sourceTitle
            },
            metadata: {
                language: result.metadata.language,
                section: result.metadata.section,
                headingLevel: result.metadata.headingLevel
            },
            score: result.score
        }));
    }
    /**
     * Rank and diversify search results
     */
    rankAndDiversifyResults(results, query) {
        // Apply additional scoring factors
        const scoredResults = results.map(result => ({
            ...result,
            adjustedScore: this.calculateAdjustedScore(result, query)
        }));
        // Sort by adjusted score
        scoredResults.sort((a, b) => b.adjustedScore - a.adjustedScore);
        // Diversify results to avoid too many from the same source
        const diversifiedResults = this.diversifyResults(scoredResults);
        return diversifiedResults.map(result => ({
            content: result.content,
            source: result.source,
            metadata: result.metadata,
            score: result.score
        }));
    }
    /**
     * Calculate adjusted score with additional factors
     */
    calculateAdjustedScore(result, query) {
        let score = result.score;
        // Boost score based on content length (prefer more substantial content)
        const contentLength = result.content.length;
        if (contentLength > 500) {
            score *= 1.1;
        }
        else if (contentLength < 100) {
            score *= 0.9;
        }
        // Boost score for code if query contains code-related terms
        const codeTerms = ['function', 'class', 'method', 'implementation', 'code', 'api', 'library'];
        const hasCodeTerms = codeTerms.some(term => query.toLowerCase().includes(term) || result.content.toLowerCase().includes(term));
        if (hasCodeTerms && result.source.type === 'github') {
            score *= 1.2;
        }
        // Boost score for documentation if query contains question words
        const questionWords = ['how', 'what', 'why', 'when', 'where', 'guide', 'tutorial', 'documentation'];
        const hasQuestionWords = questionWords.some(word => query.toLowerCase().includes(word));
        if (hasQuestionWords && result.source.type === 'documentation') {
            score *= 1.15;
        }
        // Boost score for exact phrase matches
        const queryWords = query.toLowerCase().split(/\s+/);
        const contentLower = result.content.toLowerCase();
        const exactMatches = queryWords.filter(word => contentLower.includes(word)).length;
        const exactMatchBoost = 1 + (exactMatches / queryWords.length) * 0.1;
        score *= exactMatchBoost;
        // Prefer content with clear structure (headers, sections)
        if (result.metadata.section) {
            score *= 1.05;
        }
        return Math.min(score, 1.0); // Cap at 1.0
    }
    /**
     * Diversify results to include variety of sources
     */
    diversifyResults(results) {
        const diversified = [];
        const sourceCount = {};
        const maxPerSource = 3; // Maximum results per source
        for (const result of results) {
            const sourceKey = result.source.url;
            const currentCount = sourceCount[sourceKey] || 0;
            if (currentCount < maxPerSource) {
                diversified.push(result);
                sourceCount[sourceKey] = currentCount + 1;
            }
        }
        // If we have fewer results than requested due to diversification,
        // add more from the highest-scoring sources
        if (diversified.length < results.length && diversified.length < 10) {
            const remaining = results.filter(r => !diversified.includes(r));
            const additionalCount = Math.min(remaining.length, 10 - diversified.length);
            diversified.push(...remaining.slice(0, additionalCount));
        }
        return diversified;
    }
    /**
     * Format search results for display
     */
    formatResultsForDisplay(results) {
        if (results.length === 0) {
            return 'No results found.';
        }
        const formattedResults = results.map((result, index) => {
            const sourceInfo = (() => {
                const p = result.source.path;
                if (!p)
                    return result.source.url;
                // If path already looks like an absolute URL, use it directly
                if (/^https?:\/\//i.test(p))
                    return p;
                return `${result.source.url}/${p}`;
            })();
            const metadata = [];
            if (result.metadata.language)
                metadata.push(`Language: ${result.metadata.language}`);
            if (result.metadata.section)
                metadata.push(`Section: ${result.metadata.section}`);
            const metadataStr = metadata.length > 0 ? ` (${metadata.join(', ')})` : '';
            const score = (result.score * 100).toFixed(1);
            // Truncate content if too long
            const maxContentLength = 500;
            let content = result.content;
            if (content.length > maxContentLength) {
                content = content.substring(0, maxContentLength) + '...';
            }
            return `## Result ${index + 1} (${score}% match)
**Source:** ${sourceInfo}${metadataStr}

${content}

---`;
        });
        return formattedResults.join('\n\n');
    }
    /**
     * Get search suggestions based on indexed content
     */
    async getSearchSuggestions(partialQuery) {
        // This would require maintaining an index of common terms
        // For now, return some basic suggestions
        const basicSuggestions = [
            'how to implement',
            'API documentation',
            'configuration guide',
            'troubleshooting',
            'best practices',
            'getting started',
            'examples',
            'tutorial'
        ];
        return basicSuggestions.filter(suggestion => suggestion.toLowerCase().includes(partialQuery.toLowerCase()));
    }
    /**
     * Health check for the search tool
     */
    async healthCheck() {
        try {
            const checks = await Promise.all([
                this.embeddingService.healthCheck(),
                this.vectorStoreService.healthCheck()
            ]);
            return checks.every(check => check === true);
        }
        catch (error) {
            console.error('Search context tool health check failed:', error);
            return false;
        }
    }
}
//# sourceMappingURL=SearchContextTool.js.map