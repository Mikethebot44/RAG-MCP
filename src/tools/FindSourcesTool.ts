import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { FindSourcesInput, ScoutError } from '../types/index.js';

export class FindSourcesTool {
  constructor() {}

  getToolDefinition(): Tool {
    return {
      name: 'find_sources',
      description: 'Find relevant source URLs on the web for a given prompt using Firecrawl Search. Supports category filters (GitHub, Research).',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Prompt or query to find relevant sources for' },
          limit: { type: 'number', default: 10, description: 'Maximum number of sources to return' },
          github: { type: 'boolean', default: false, description: 'Include GitHub category results' },
          research: { type: 'boolean', default: false, description: 'Include Research category results' },
          mainContentOnly: { type: 'boolean', default: true, description: 'When indexing later, extract only main content' },
          includeTags: { type: 'array', items: { type: 'string' }, description: 'HTML tags/selectors to include during indexing' },
          excludeTags: { type: 'array', items: { type: 'string' }, description: 'HTML tags/selectors to exclude during indexing' }
        },
        required: ['query']
      }
    }
  }

  async execute(input: FindSourcesInput): Promise<{ success: boolean; message: string; sources?: Array<{ url: string; title?: string; description?: string; category?: string }>; searchTime?: number; }>{
    const start = Date.now()
    try {
      const firecrawlKey = process.env.FIRECRAWL_API_KEY
      if (!firecrawlKey) {
        throw new ScoutError('FIRECRAWL_API_KEY is required to find sources', 'CONFIG_ERROR')
      }
      const resp = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${firecrawlKey}` },
        body: JSON.stringify({ query: input.query, limit: Math.max(1, Math.min(50, input.limit ?? 10)) })
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new ScoutError(`Firecrawl search failed: ${resp.status} ${resp.statusText} ${text}`, 'SEARCH_ERROR')
      }
      const data = await resp.json().catch(() => ({} as any))
      const sources = ((data?.results || []) as Array<any>).map(r => ({ url: r.url, title: r.title, description: r.description }))
      return { success: true, message: `Found ${sources.length} sources`, sources, searchTime: Date.now() - start }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      return { success: false, message: msg, searchTime: Date.now() - start }
    }
  }
}


