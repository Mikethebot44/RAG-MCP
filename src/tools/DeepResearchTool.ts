import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { DeepResearchInput, ScoutError } from '../types/index.js';

export class DeepResearchTool {
  constructor() {}

  getToolDefinition(): Tool {
    return {
      name: 'deep_research',
      description: 'Find m relevant sources using Firecrawl Search and then index them via the Scout API (cheerio-based indexing).',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Prompt or query to research' },
          limit: { type: 'number', default: 5, description: 'Number of sources to index' },
          github: { type: 'boolean', default: false, description: 'Include GitHub category results' },
          research: { type: 'boolean', default: false, description: 'Include Research category results' },
          mainContentOnly: { type: 'boolean', default: true, description: 'Extract only main content when indexing' },
          includeTags: { type: 'array', items: { type: 'string' }, description: 'HTML tags/selectors to include during indexing' },
          excludeTags: { type: 'array', items: { type: 'string' }, description: 'HTML tags/selectors to exclude during indexing' }
        },
        required: ['query']
      }
    }
  }

  async execute(input: DeepResearchInput): Promise<{ success: boolean; message: string; started?: number; completed?: number; details?: any; }>{
    try {
      // Call Scout API route to perform Firecrawl search (using app key) and index
      const scoutApiUrl = process.env.SCOUT_API_URL || 'https://scout-mauve-nine.vercel.app'
      const projectId = process.env.SCOUT_PROJECT_ID
      const apiKey = process.env.SCOUT_API_KEY
      if (!projectId || !apiKey) throw new ScoutError('SCOUT_API_KEY and SCOUT_PROJECT_ID are required', 'CONFIG_ERROR')

      const indexResp = await fetch(`${scoutApiUrl}/api/scout/deep-research?projectId=${encodeURIComponent(projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          query: input.query,
          limit: Math.max(1, Math.min(25, input.limit ?? 5)),
          options: {
            mainContentOnly: input.mainContentOnly ?? true,
            includeTags: input.includeTags,
            excludeTags: input.excludeTags
          },
          github: !!input.github,
          research: !!input.research
        })
      })
      const text = await indexResp.text().catch(() => '')
      if (!indexResp.ok) {
        throw new ScoutError(`Deep research indexing failed: ${indexResp.status} ${indexResp.statusText} ${text}`, 'INDEX_ERROR')
      }
      let parsed: any = {}
      try { parsed = JSON.parse(text) } catch {}

      return { success: true, message: 'Deep research queued', started: parsed?.started || 0, completed: parsed?.completed || 0, details: parsed }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Unknown error' }
    }
  }
}


