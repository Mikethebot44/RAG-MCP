export class DeleteSourceTool {
    vectorStoreService;
    listSourcesTool;
    constructor(vectorStoreService, listSourcesTool) {
        this.vectorStoreService = vectorStoreService;
        this.listSourcesTool = listSourcesTool;
    }
    /**
     * Get tool definition for MCP
     */
    getToolDefinition() {
        return {
            name: 'delete_source',
            description: 'Delete an indexed source and all its associated chunks from the vector database.',
            inputSchema: {
                type: 'object',
                properties: {
                    sourceId: {
                        type: 'string',
                        description: 'ID of the source to delete from vector store'
                    }
                },
                required: ['sourceId']
            }
        };
    }
    /**
     * Execute the delete source operation
     */
    async execute(input) {
        const startTime = Date.now();
        try {
            console.log(`Attempting to delete source: ${input.sourceId}`);
            // First, find the source by ID
            const sourceInfo = await this.findSourceById(input.sourceId);
            if (!sourceInfo) {
                // Try to find by URL (in case user provided URL instead of ID)
                const sourceByUrl = await this.findSourceByUrl(input.sourceId);
                if (sourceByUrl) {
                    return this.deleteSourceByUrl(sourceByUrl.url, startTime);
                }
                return {
                    success: false,
                    message: `Source not found: ${input.sourceId}. Use list_sources to see available sources.`,
                    deletionTime: Date.now() - startTime
                };
            }
            return this.deleteSourceByUrl(sourceInfo.url, startTime);
        }
        catch (error) {
            console.error('Error deleting source:', error);
            const deletionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error
                ? error.message
                : 'Unknown error occurred while deleting source';
            return {
                success: false,
                message: `Failed to delete source: ${errorMessage}`,
                deletionTime
            };
        }
    }
    /**
     * Delete source by URL
     */
    async deleteSourceByUrl(sourceUrl, startTime) {
        try {
            // Get initial statistics
            const stats = await this.vectorStoreService.getIndexStats();
            const initialVectorCount = stats.totalVectors;
            // Delete all vectors matching the source URL
            console.log(`Deleting all chunks for source: ${sourceUrl}`);
            await this.vectorStoreService.deleteByFilter({
                sourceUrl: sourceUrl
            });
            // Get final statistics to calculate deleted count
            const finalStats = await this.vectorStoreService.getIndexStats();
            const deletedChunks = initialVectorCount - finalStats.totalVectors;
            const deletionTime = Date.now() - startTime;
            if (deletedChunks === 0) {
                return {
                    success: false,
                    message: `No chunks found for source: ${sourceUrl}. It may have already been deleted.`,
                    sourceUrl,
                    deletionTime
                };
            }
            return {
                success: true,
                message: `Successfully deleted source "${sourceUrl}" and ${deletedChunks} associated chunks`,
                deletedChunks,
                sourceUrl,
                deletionTime
            };
        }
        catch (error) {
            const deletionTime = Date.now() - startTime;
            throw new Error(`Failed to delete source "${sourceUrl}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Find source by ID
     */
    async findSourceById(sourceId) {
        try {
            const result = await this.listSourcesTool.execute({});
            if (!result.success || !result.sources) {
                return null;
            }
            const source = result.sources.find(s => s.id === sourceId);
            return source ? {
                id: source.id,
                url: source.url,
                title: source.title
            } : null;
        }
        catch (error) {
            console.error('Error finding source by ID:', error);
            return null;
        }
    }
    /**
     * Find source by URL (in case user provided URL instead of ID)
     */
    async findSourceByUrl(url) {
        try {
            // Normalize URL for comparison
            const normalizedUrl = this.normalizeUrl(url);
            const result = await this.listSourcesTool.execute({});
            if (!result.success || !result.sources) {
                return null;
            }
            const source = result.sources.find(s => this.normalizeUrl(s.url) === normalizedUrl);
            return source ? {
                id: source.id,
                url: source.url,
                title: source.title
            } : null;
        }
        catch (error) {
            console.error('Error finding source by URL:', error);
            return null;
        }
    }
    /**
     * Normalize URL for consistent comparison
     */
    normalizeUrl(url) {
        try {
            const parsed = new URL(url);
            // Remove trailing slash and convert to lowercase
            return parsed.toString().toLowerCase().replace(/\/$/, '');
        }
        catch {
            // If URL parsing fails, return as-is but normalized
            return url.toLowerCase().replace(/\/$/, '');
        }
    }
    /**
     * Delete multiple sources by IDs
     */
    async deleteMultipleSources(sourceIds) {
        const results = [];
        let totalDeleted = 0;
        for (const sourceId of sourceIds) {
            try {
                const result = await this.execute({ sourceId });
                results.push({
                    sourceId,
                    success: result.success,
                    message: result.message,
                    deletedChunks: result.deletedChunks
                });
                if (result.success && result.deletedChunks) {
                    totalDeleted += result.deletedChunks;
                }
            }
            catch (error) {
                results.push({
                    sourceId,
                    success: false,
                    message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
            }
        }
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;
        return {
            success: successCount > 0,
            message: `Deleted ${successCount}/${sourceIds.length} sources (${totalDeleted} total chunks). ${failureCount > 0 ? `${failureCount} failures.` : ''}`,
            results,
            totalDeleted
        };
    }
    /**
     * Delete all sources (dangerous operation)
     */
    async deleteAllSources(confirmationPhrase) {
        const requiredPhrase = "DELETE ALL SOURCES";
        if (confirmationPhrase !== requiredPhrase) {
            return {
                success: false,
                message: `To delete all sources, you must provide the exact confirmation phrase: "${requiredPhrase}"`
            };
        }
        try {
            // Get all sources first
            const listResult = await this.listSourcesTool.execute({});
            if (!listResult.success || !listResult.sources) {
                return {
                    success: false,
                    message: 'Failed to retrieve sources for deletion'
                };
            }
            if (listResult.sources.length === 0) {
                return {
                    success: true,
                    message: 'No sources to delete',
                    deletedSources: 0,
                    deletedChunks: 0
                };
            }
            // Get initial vector count
            const initialStats = await this.vectorStoreService.getIndexStats();
            const initialVectorCount = initialStats.totalVectors;
            // Delete all vectors (this is dangerous!)
            console.log('DANGER: Deleting ALL sources and vectors from the database');
            // Since we can't easily delete all vectors in Pinecone without specific IDs,
            // we'll delete by source URLs one by one
            const sourceUrls = listResult.sources.map(s => s.url);
            for (const sourceUrl of sourceUrls) {
                await this.vectorStoreService.deleteByFilter({
                    sourceUrl: sourceUrl
                });
            }
            // Get final count
            const finalStats = await this.vectorStoreService.getIndexStats();
            const deletedChunks = initialVectorCount - finalStats.totalVectors;
            return {
                success: true,
                message: `Successfully deleted all ${listResult.sources.length} sources and ${deletedChunks} chunks`,
                deletedSources: listResult.sources.length,
                deletedChunks
            };
        }
        catch (error) {
            console.error('Error deleting all sources:', error);
            return {
                success: false,
                message: `Failed to delete all sources: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    /**
     * Preview what would be deleted (dry run)
     */
    async previewDeletion(sourceId) {
        try {
            const sourceInfo = await this.findSourceById(sourceId);
            if (!sourceInfo) {
                const sourceByUrl = await this.findSourceByUrl(sourceId);
                if (!sourceByUrl) {
                    return {
                        success: false,
                        message: `Source not found: ${sourceId}`
                    };
                }
                // Get chunk count by listing sources
                const listResult = await this.listSourcesTool.execute({});
                const source = listResult.sources?.find(s => s.url === sourceByUrl.url);
                return {
                    success: true,
                    message: `Would delete source: ${sourceByUrl.title}`,
                    sourceInfo: {
                        id: sourceByUrl.id,
                        url: sourceByUrl.url,
                        title: sourceByUrl.title,
                        chunkCount: source?.chunkCount || 0
                    }
                };
            }
            // Get chunk count
            const listResult = await this.listSourcesTool.execute({});
            const source = listResult.sources?.find(s => s.id === sourceId);
            return {
                success: true,
                message: `Would delete source: ${sourceInfo.title}`,
                sourceInfo: {
                    id: sourceInfo.id,
                    url: sourceInfo.url,
                    title: sourceInfo.title,
                    chunkCount: source?.chunkCount || 0
                }
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Error previewing deletion: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    /**
     * Health check for the delete source tool
     */
    async healthCheck() {
        try {
            const checks = await Promise.all([
                this.vectorStoreService.healthCheck(),
                this.listSourcesTool.healthCheck()
            ]);
            return checks.every(check => check === true);
        }
        catch (error) {
            console.error('Delete source tool health check failed:', error);
            return false;
        }
    }
}
//# sourceMappingURL=DeleteSourceTool.js.map