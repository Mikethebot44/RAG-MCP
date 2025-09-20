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
      const scoutApiUrl = process.env.SCOUT_API_URL || 'https://scout-mauve-nine.vercel.app'
      const projectId = process.env.SCOUT_PROJECT_ID
      const apiKey = process.env.SCOUT_API_KEY
      if (!projectId || !apiKey) throw new ScoutError('SCOUT_API_KEY and SCOUT_PROJECT_ID are required', 'CONFIG_ERROR')

      const resp = await fetch(`${scoutApiUrl}/api/scout/find-sources?projectId=${encodeURIComponent(projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          query: input.query,
          limit: Math.max(1, Math.min(50, input.limit ?? 10)),
          github: !!input.github,
          research: !!input.research
        })
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new ScoutError(`find-sources API failed: ${resp.status} ${resp.statusText} ${text}`, 'SEARCH_ERROR')
      }
      const data = await resp.json().catch(() => ({} as any))
      const sources = (data?.sources || []) as Array<{ url: string; title?: string; description?: string; category?: string }>
      return { success: true, message: `Found ${sources.length} sources`, sources, searchTime: Date.now() - start }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      return { success: false, message: msg, searchTime: Date.now() - start }
    }
  }
}


