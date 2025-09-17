import { Vector, QueryResult, VectorStoreError, ScoutConfig, IVectorStoreService } from '../types/index.js';

export class ScoutVectorStoreService implements IVectorStoreService {
  private scoutConfig: NonNullable<ScoutConfig['scout']>;
  private apiUrl: string;
  private batchSize: number;

  constructor(config: ScoutConfig) {
    if (!config.scout) {
      throw new VectorStoreError('Scout configuration is required for ScoutVectorStoreService');
    }

    this.scoutConfig = config.scout;
    this.apiUrl = config.scout.apiUrl || 'https://api.scout.ai';
    this.batchSize = config.processing.batchSize;
  }

  /**
   * Initialize the vector store (handled by Scout API)
   */
  async initialize(): Promise<void> {
    // Scout API handles index initialization automatically
    // Just validate that the API is accessible
    try {
      await this.healthCheck();
    } catch (error) {
      throw new VectorStoreError(
        `Failed to initialize Scout vector store: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { projectId: this.scoutConfig.projectId, error }
      );
    }
  }

  /**
   * Upsert vectors to Scout API in batches with retry logic
   */
  async upsertVectors(vectors: Vector[]): Promise<void> {
    if (vectors.length === 0) return;

    const batches = this.createBatches(vectors, this.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const response = await fetch(`${this.apiUrl}/api/scout/vector-store?operation=upsert&projectId=${this.scoutConfig.projectId}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.scoutConfig.apiKey}`
            },
            body: JSON.stringify({
              vectors: batch,
              namespace: 'documents'
            })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new VectorStoreError(
              `Scout API upsert error: ${response.status} ${response.statusText}`,
              { 
                batchIndex: i,
                batchSize: batch.length,
                status: response.status,
                statusText: response.statusText,
                errorData
              }
            );
          }

          const data = await response.json();
          console.log(`Upserted batch ${i + 1}/${batches.length} (${batch.length} vectors) via Scout API`);
          break; // Success

        } catch (error) {
          retryCount++;
          
          if (retryCount >= maxRetries) {
            throw new VectorStoreError(
              `Failed to upsert batch ${i + 1} via Scout API after ${maxRetries} retries: ${error instanceof Error ? error.message : 'Unknown error'}`,
              { batchIndex: i, batchSize: batch.length, error }
            );
          }

          // Exponential backoff
          const delay = Math.pow(2, retryCount) * 1000;
          console.warn(`Batch ${i + 1} failed, retrying in ${delay}ms... (attempt ${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  /**
   * Query vectors using similarity search via Scout API
   */
  async queryVectors(
    vector: number[],
    options: {
      topK?: number;
      filter?: Record<string, any>;
      threshold?: number;
      includeMetadata?: boolean;
    } = {}
  ): Promise<QueryResult[]> {
    const {
      topK = 10,
      filter,
      threshold = 0.7,
      includeMetadata = true
    } = options;

    try {
      const response = await fetch(`${this.apiUrl}/api/scout/vector-store?operation=query&projectId=${this.scoutConfig.projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.scoutConfig.apiKey}`
        },
        body: JSON.stringify({
          vector,
          topK,
          filter,
          includeMetadata,
          includeValues: false,
          namespace: 'documents'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new VectorStoreError(
          `Scout API query error: ${response.status} ${response.statusText}`,
          { 
            topK,
            filter,
            threshold,
            status: response.status,
            statusText: response.statusText,
            errorData
          }
        );
      }

      const data = await response.json();
      const results: QueryResult[] = [];
      
      if (data.matches) {
        for (const match of data.matches) {
          if (match.score && match.score >= threshold) {
            results.push({
              id: match.id,
              score: match.score,
              metadata: match.metadata as Vector['metadata']
            });
          }
        }
      }

      return results.sort((a, b) => b.score - a.score);
    } catch (error) {
      if (error instanceof VectorStoreError) {
        throw error;
      }
      
      throw new VectorStoreError(
        `Failed to query vectors via Scout API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { topK, filter, threshold, error }
      );
    }
  }

  /**
   * Delete vectors by IDs via Scout API
   */
  async deleteVectors(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    try {
      const batches = this.createBatches(ids, this.batchSize);

      for (const batch of batches) {
        const response = await fetch(`${this.apiUrl}/api/scout/vector-store?operation=delete&projectId=${this.scoutConfig.projectId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.scoutConfig.apiKey}`
          },
          body: JSON.stringify({
            ids: batch,
            namespace: 'documents'
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new VectorStoreError(
            `Scout API delete error: ${response.status} ${response.statusText}`,
            { 
              ids: batch,
              status: response.status,
              statusText: response.statusText,
              errorData
            }
          );
        }
      }
    } catch (error) {
      if (error instanceof VectorStoreError) {
        throw error;
      }
      
      throw new VectorStoreError(
        `Failed to delete vectors via Scout API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { ids, error }
      );
    }
  }

  /**
   * Delete all vectors matching a filter via Scout API
   */
  async deleteByFilter(filter: Record<string, any>): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/api/scout/vector-store?operation=delete&projectId=${this.scoutConfig.projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.scoutConfig.apiKey}`
        },
        body: JSON.stringify({
          filter,
          namespace: 'documents'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new VectorStoreError(
          `Scout API delete by filter error: ${response.status} ${response.statusText}`,
          { 
            filter,
            status: response.status,
            statusText: response.statusText,
            errorData
          }
        );
      }
    } catch (error) {
      if (error instanceof VectorStoreError) {
        throw error;
      }
      
      throw new VectorStoreError(
        `Failed to delete vectors by filter via Scout API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { filter, error }
      );
    }
  }

  /**
   * Get index statistics via Scout API
   */
  async getIndexStats(): Promise<{
    totalVectors: number;
    dimension: number;
    indexFullness: number;
  }> {
    try {
      const response = await fetch(`${this.apiUrl}/api/scout/vector-store?operation=stats&projectId=${this.scoutConfig.projectId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.scoutConfig.apiKey}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new VectorStoreError(
          `Scout API stats error: ${response.status} ${response.statusText}`,
          { 
            projectId: this.scoutConfig.projectId,
            status: response.status,
            statusText: response.statusText,
            errorData
          }
        );
      }

      const data = await response.json();
      
      return {
        totalVectors: data.totalRecordCount || 0,
        dimension: data.dimension || 0,
        indexFullness: data.indexFullness || 0
      };
    } catch (error) {
      if (error instanceof VectorStoreError) {
        throw error;
      }
      
      throw new VectorStoreError(
        `Failed to get index stats via Scout API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { projectId: this.scoutConfig.projectId, error }
      );
    }
  }

  /**
   * List all unique source URLs in the index
   */
  async listSources(): Promise<string[]> {
    try {
      // This would need to be implemented on the Scout API side
      // For now, return an empty array with a warning
      console.warn('listSources() not implemented for Scout API mode');
      return [];
    } catch (error) {
      throw new VectorStoreError(
        `Failed to list sources via Scout API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error }
      );
    }
  }

  /**
   * Create a document record via Scout API so it appears in dashboard
   */
  async createDocument(params: { name: string; type: 'github' | 'documentation' | 'local'; source_url: string; source_metadata?: any }): Promise<{ id: string }> {
    const response = await fetch(`${this.apiUrl}/api/scout/documents?projectId=${this.scoutConfig.projectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.scoutConfig.apiKey}`
      },
      body: JSON.stringify(params)
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new VectorStoreError(`Failed to create document: ${response.status} ${response.statusText} ${text}`)
    }
    const data = await response.json()
    const id = data?.document?.id
    if (!id) throw new VectorStoreError('Document creation succeeded but no id returned')
    return { id }
  }

  /**
   * Update a document record status via Scout API (best-effort)
   */
  async updateDocument(params: { id: string; status?: 'pending' | 'indexing' | 'indexed' | 'failed'; chunk_count?: number; token_count?: number; error_message?: string; indexing_stage?: string }): Promise<void> {
    try {
      const { id, ...rest } = params
      // First try the dedicated status endpoint for API key auth
      await fetch(`${this.apiUrl}/api/scout/documents/${id}/status?projectId=${this.scoutConfig.projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.scoutConfig.apiKey}`
        },
        body: JSON.stringify({
          status: rest.status,
          indexing_stage: rest.indexing_stage,
          chunk_count: rest.chunk_count,
          token_count: rest.token_count,
          error_message: rest.error_message
        })
      }).catch(() => {})
    } catch {}
  }

  /**
   * Create batches from an array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Generate a unique vector ID based on content
   */
  static async generateVectorId(sourceUrl: string, chunkHash: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256')
      .update(`${sourceUrl}:${chunkHash}`)
      .digest('hex');
  }

  /**
   * Health check for the vector store connection via Scout API
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getIndexStats();
      return true;
    } catch (error) {
      console.error('Scout vector store health check failed:', error);
      return false;
    }
  }
}