import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ScoutError } from '../types/index.js';
import * as cheerio from 'cheerio';
import { extractMarkdown } from '../utils/extractMarkdown.js'

type Input = {
  url: string;
  mainContentOnly?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
}

export class ScrapePageTool {
  constructor() {}

  getToolDefinition(): Tool {
    return {
      name: 'scrape_page',
      description: 'Scrape a single web page and return markdown content using cheerio extraction.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Page URL to scrape' },
          mainContentOnly: { type: 'boolean', default: true, description: 'Extract only main content area' },
          includeTags: { type: 'array', items: { type: 'string' }, description: 'CSS selectors to include (optional)' },
          excludeTags: { type: 'array', items: { type: 'string' }, description: 'CSS selectors to exclude (optional)' }
        },
        required: ['url']
      }
    }
  }

  async execute(input: Input): Promise<{ success: boolean; message: string; markdown?: string; contentLength?: number }>{
    try {
      const url = input.url
      const result = await extractMarkdown(url, {
        mainContentOnly: input.mainContentOnly,
        includeTags: input.includeTags,
        excludeTags: input.excludeTags
      })
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


