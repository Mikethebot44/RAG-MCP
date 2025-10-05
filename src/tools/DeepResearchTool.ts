import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { DeepResearchInput, ScoutError } from '../types/index.js';

export class DeepResearchTool {
  constructor() {}

  getToolDefinition(): Tool {
    return {
      name: 'deep_research',
      description: 'Find m relevant sources using Firecrawl Search and return URLs you can pass to index_source.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Prompt or query to research' },
          limit: { type: 'number', default: 5, description: 'Number of sources to index' },
          github: { type: 'boolean', default: false, description: 'Include GitHub category results' },
          research: { type: 'boolean', default: false, description: 'Include Research category results' },
          mainContentOnly: { type: 'boolean', default: true, description: 'Extract only main content when indexing' },
          includeTags: { type: 'array', items: { type: 'string' }, description: 'HTML tags/selectors to include during indexing' },
          excludeTags: { type: 'array', items: { type: 'string' }, description: 'HTML tags/selectors to exclude during indexing' },
          scrapingBackend: { type: 'string', enum: ['playwright', 'firecrawl'], default: 'playwright', description: 'Backend to use when later indexing URLs' }
        },
        required: ['query']
      }
    }
  }

  async execute(input: DeepResearchInput): Promise<{ success: boolean; message: string; started?: number; completed?: number; details?: any; }>{
    try {
      const firecrawlKey = process.env.FIRECRAWL_API_KEY
      if (!firecrawlKey) throw new ScoutError('FIRECRAWL_API_KEY is required to run deep research', 'CONFIG_ERROR')
      const resp = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${firecrawlKey}` },
        body: JSON.stringify({ query: input.query, limit: Math.max(1, Math.min(25, input.limit ?? 5)) })
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new ScoutError(`Firecrawl search failed: ${resp.status} ${resp.statusText} ${text}`, 'SEARCH_ERROR')
      }
      const data = await resp.json().catch(() => ({} as any))
      const sources = (data?.results || []) as Array<{ url: string }>
      return { success: true, message: `Queued ${sources.length} sources for indexing. Use index_source per URL.`, started: sources.length, completed: 0, details: { sources, scrapingBackend: input.scrapingBackend || 'playwright' } }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Unknown error' }
    }
  }
}


