import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ScoutError } from '../types/index.js';
import * as cheerio from 'cheerio';
import { extractMarkdown } from '../utils/extractMarkdown.js'
import { WebScrapingService } from '../services/WebScrapingService.js'

type Input = {
  url: string;
  mainContentOnly?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  scrapingBackend?: 'playwright' | 'firecrawl';
}

export class ScrapePageTool {
  private webScrapingService?: WebScrapingService
  constructor(webScrapingService?: WebScrapingService) {
    this.webScrapingService = webScrapingService
  }

  getToolDefinition(): Tool {
    return {
      name: 'scrape_page',
      description: 'Scrape a single web page and return markdown content. Supports playwright (default) and firecrawl.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Page URL to scrape' },
          mainContentOnly: { type: 'boolean', default: true, description: 'Extract only main content area' },
          includeTags: { type: 'array', items: { type: 'string' }, description: 'CSS selectors to include (optional)' },
          excludeTags: { type: 'array', items: { type: 'string' }, description: 'CSS selectors to exclude (optional)' },
          scrapingBackend: { type: 'string', enum: ['playwright', 'firecrawl'], default: 'playwright', description: 'Scraping backend to use' }
        },
        required: ['url']
      }
    }
  }

  async execute(input: Input): Promise<{ success: boolean; message: string; markdown?: string; contentLength?: number }>{
    try {
      const backend = input.scrapingBackend || 'playwright'
      const url = input.url

      if (backend === 'firecrawl') {
        const apiKey = process.env.FIRECRAWL_API_KEY
        if (!apiKey) return { success: false, message: 'FIRECRAWL_API_KEY is required for firecrawl backend' }
        const resp = await fetch('https://api.firecrawl.dev/v1/crawl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ urls: [url], formats: ['markdown'], includeTags: input.includeTags, excludeTags: input.excludeTags })
        })
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          return { success: false, message: `Firecrawl crawl failed: ${resp.status} ${resp.statusText} ${text}` }
        }
        const data: any = await resp.json().catch(() => ({}))
        const md = (data?.results?.[0]?.markdown as string | undefined) || (data?.markdown as string | undefined)
        const contentLength = md ? md.length : 0
        return { success: true, message: 'Scraped page successfully', markdown: md, contentLength }
      }

      // playwright (default)
      if (this.webScrapingService) {
        const doc = await this.webScrapingService.processDocumentation(url, { maxDepth: 0, onlyMainContent: input.mainContentOnly })
        const page = doc.pages[0]
        const md = (page as any)?.markdown || `# ${page.title}\n\n${page.content}`
        return { success: true, message: 'Scraped page successfully', markdown: md, contentLength: md?.length }
      }

      // Fallback: cheerio-based extraction
      const result = await extractMarkdown(url, { mainContentOnly: input.mainContentOnly, includeTags: input.includeTags, excludeTags: input.excludeTags })
      const markdown = result.markdown
      const contentLength = markdown ? markdown.length : 0
      return { success: true, message: 'Scraped page successfully', markdown, contentLength }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Unknown error' }
    }
  }
}

function escapeMd(text: string): string {
  return text.replace(/[*_`~]/g, (m) => `\\${m}`)
}


