import { chromium } from 'playwright'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'

export type ExtractOptions = {
  mainContentOnly?: boolean
  includeTags?: string[]
  excludeTags?: string[]
}

const DEFAULT_MAIN_SELECTORS = [
  'main',
  'article',
  '[role="main"]',
  '.content',
  '.documentation',
  '.docs',
  '.markdown-body',
  '#content',
  '.docs-content',
  '.main-content',
  '.prose'
]

export async function extractMarkdown(
  url: string,
  options: ExtractOptions = {}
): Promise<{ title: string; markdown: string }> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
  })
  try {
    // Navigate and ensure initial DOM
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    // Give the page time to settle network requests (best-effort)
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }) } catch {}

    // Try to wait for a main content selector to ensure dynamic pages render
    const selectors = (options.includeTags && options.includeTags.length > 0)
      ? options.includeTags
      : DEFAULT_MAIN_SELECTORS
    const joinedSelector = selectors.join(', ')
    try {
      await page.waitForSelector(joinedSelector, { timeout: 20000 })
    } catch {
      // ignore timeout; we'll fallback to whatever HTML we have
    }

    const html = await page.content()

    const dom = new JSDOM(html, { url })
    const article = new Readability(dom.window.document).parse()

    const fallbackTitle = await page.title().catch(() => '')
    const title = (article?.title?.trim() || fallbackTitle || new URL(url).hostname).trim()

    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

    // Apply exclude filters before selecting content
    if (options.excludeTags && options.excludeTags.length > 0) {
      for (const sel of options.excludeTags) {
        const nodes = dom.window.document.querySelectorAll(sel)
        nodes.forEach((n) => n.parentNode?.removeChild(n))
      }
    }

    const mainOnly = options.mainContentOnly !== false
    let htmlForMd = ''
    const primary = article?.content || ''
    if (mainOnly) {
      const includeList = (options.includeTags && options.includeTags.length > 0)
        ? options.includeTags
        : DEFAULT_MAIN_SELECTORS
      const selected: string[] = []
      for (const sel of includeList) {
        const el = dom.window.document.querySelector(sel) as HTMLElement | null
        if (el && el.innerHTML) {
          selected.push(el.innerHTML)
        }
      }
      htmlForMd = primary || selected.join('\n')
    } else {
      htmlForMd = primary || (dom.window.document.body?.innerHTML || '')
    }

    // Fallback: if still empty, grab body
    if (!htmlForMd || htmlForMd.trim().length === 0) {
      htmlForMd = dom.window.document.body?.innerHTML || ''
    }

    let markdown = `# ${title}\n\n${turndown.turndown(htmlForMd)}`.trim()

    // If result is unexpectedly short, fallback to text content to avoid empty output
    if (!markdown || markdown.replace(/[#\s]/g, '').length < 50) {
      const textContent = (dom.window.document.body?.textContent || '').trim()
      if (textContent) {
        markdown = `# ${title}\n\n${textContent}`.trim()
      }
    }

    return { title, markdown }
  } finally {
    await page.close()
    await browser.close()
  }
}



