import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ScoutError } from '../types/index.js';
import * as cheerio from 'cheerio';

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

  async execute(input: Input): Promise<{ success: boolean; message: string; markdown?: string; }>{
    try {
      const url = input.url
      let res: Response
      try {
        res = await fetch(url, { headers: { 'User-Agent': 'Scout-MCP/1.0 (Cheerio)' } }) as Response
      } catch (e) {
        throw new ScoutError(`Failed to fetch URL: ${url}`, 'NETWORK_ERROR')
      }
      if (!res.ok) {
        throw new ScoutError(`HTTP ${res.status} ${res.statusText} for ${url}`, 'HTTP_ERROR')
      }
      const html = await res.text()
      const $ = cheerio.load(html)

      // Remove unwanted elements globally first
      $('script, style, noscript, iframe, svg').remove()

      // Choose container
      let $container = $('body')
      if (input.mainContentOnly !== false) {
        const selectors = [
          'main',
          '[role="main"]',
          '.content',
          '.documentation',
          '.docs',
          '.markdown-body',
          'article',
          '.article-content',
          '#content'
        ]
        for (const sel of selectors) {
          const found = $(sel)
          if (found.length > 0 && found.text().trim().length > 200) { 
            const first = found.first()
            if (first.length > 0) {
              $container = first as any
              break
            }
          }
        }
      }

      // Apply exclude selectors
      if (Array.isArray(input.excludeTags)) {
        for (const sel of input.excludeTags) {$container.find(sel).remove()}
      }

      // If includeTags provided, focus only on those regions concatenated
      let $target = $container
      if (Array.isArray(input.includeTags) && input.includeTags.length > 0) {
        const parts: string[] = []
        for (const sel of input.includeTags) {
          $container.find(sel).each((_: number, el: any) => { parts.push($(el).html() || '') })
        }
        const joined = parts.join('\n') || $container.html() || ''
        $target = cheerio.load(`<div>${joined}</div>`)('div')
      }

      // Basic markdown conversion: title, headings, paragraphs, lists, code blocks.
      const title = ($('title').text().trim() || $('h1').first().text().trim() || new URL(url).hostname)
      const mdLines: string[] = []
      mdLines.push(`# ${escapeMd(title)}`)

      // Headings to markdown
      $target.find('h1, h2, h3, h4, h5, h6').each((_: number, el: any) => {
        const level = Number((el.tagName as string | undefined)?.substring(1) || '2')
        const text = $(el).text().trim()
        if (text) mdLines.push(`${'#'.repeat(Math.min(6, Math.max(1, level)))} ${escapeMd(text)}`)
      })

      // Lists
      $target.find('ul, ol').each((_: number, el: any) => {
        const isOl = el.tagName === 'ol'
        let i = 1
        $(el).children('li').each((__: number, li: any) => {
          const text = $(li).text().trim()
          if (!text) return
          mdLines.push(isOl ? `${i}. ${escapeMd(text)}` : `- ${escapeMd(text)}`)
          i++
        })
        mdLines.push('')
      })

      // Code blocks
      $target.find('pre, code').each((_: number, el: any) => {
        const text = $(el).text().trim()
        if (!text) return
        if (el.tagName === 'pre') {
          mdLines.push('```')
          mdLines.push(text)
          mdLines.push('```')
          mdLines.push('')
        }
      })

      // Paragraphs
      $target.find('p').each((_: number, el: any) => {
        const text = $(el).text().trim()
        if (text && text.length > 0) {
          mdLines.push(escapeMd(text))
          mdLines.push('')
        }
      })

      // Fallback if little content extracted
      if (mdLines.length <= 1) {
        const text = $target.text().replace(/\s+/g, ' ').trim()
        if (text) mdLines.push(text)
      }

      const markdown = mdLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
      return { success: true, message: 'Scraped page successfully', markdown }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Unknown error' }
    }
  }
}

function escapeMd(text: string): string {
  return text.replace(/[*_`~]/g, (m) => `\\${m}`)
}


