import { Tool } from '@modelcontextprotocol/sdk/types.js'
import { IEmbeddingService, IVectorStoreService, ScoutError } from '../types/index.js'
import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { ContentProcessor } from '../services/ContentProcessor.js'

type Input = {
  path: string
  include?: string[]
  exclude?: string[]
  maxFileSize?: number
}

export class IndexLocalTool {
  private embedding: IEmbeddingService
  private vectorStore: IVectorStoreService
  private processor: ContentProcessor

  constructor(embedding: IEmbeddingService, vectorStore: IVectorStoreService, processor: ContentProcessor) {
    this.embedding = embedding
    this.vectorStore = vectorStore
    this.processor = processor
  }

  getToolDefinition(): Tool {
    return {
      name: 'index_local',
      description: 'Index local directory or file paths into the vector store (code and markdown supported).',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to a file or directory' },
          include: { type: 'array', items: { type: 'string' }, description: 'Glob-like patterns to include (e.g., **/*.ts)' },
          exclude: { type: 'array', items: { type: 'string' }, description: 'Glob-like patterns to exclude (e.g., node_modules/**)' },
          maxFileSize: { type: 'number', default: 1048576, description: 'Maximum file size in bytes' }
        },
        required: ['path']
      }
    }
  }

  async execute(input: Input): Promise<{ success: boolean; message: string; chunksIndexed?: number }>{
    const root = resolve(process.cwd(), input.path)
    const stats = await fs.stat(root).catch(() => null)
    if (!stats) return { success: false, message: `Path not found: ${root}` }

    const files: string[] = []
    if (stats.isDirectory()) {
      await this.walk(root, files, input)
    } else if (stats.isFile()) {
      files.push(root)
    }

    const maxSize = input.maxFileSize ?? 1048576
    const codeFiles: Array<{ path: string; content: string; language: string; size: number }> = []
    for (const file of files) {
      try {
        const st = await fs.stat(file)
        if (st.size > maxSize) continue
        const content = await fs.readFile(file, 'utf8')
        codeFiles.push({ path: file, content, language: this.detectLanguage(file), size: st.size })
      } catch {}
    }

    const chunks = [] as any[]
    for (const f of codeFiles) {
      const type = f.path.toLowerCase().endsWith('.md') ? 'readme' : 'code'
      const processed = (this.processor as any).processGitHubContent({
        url: 'file://' + root,
        repository: 'local',
        branch: 'local',
        files: [{ path: f.path, content: f.content, sha: '', size: f.size, language: f.language, downloadUrl: '' }]
      })
      chunks.push(...processed)
    }

    if (chunks.length === 0) return { success: false, message: 'No eligible files found to index' }

    const texts = chunks.map(c => c.content)
    const embeddings = await this.embedding.generateEmbeddings(texts)
    const vectors = chunks.map((chunk, i) => ({
      id: chunk.id,
      values: embeddings[i],
      metadata: {
        content: chunk.content.substring(0, 40000),
        type: chunk.type,
        sourceUrl: chunk.source.url,
        sourcePath: chunk.source.path,
        sourceTitle: 'local',
        language: chunk.metadata.language,
        size: chunk.metadata.size,
        hash: chunk.metadata.hash,
        headingLevel: chunk.metadata.headingLevel,
        section: chunk.metadata.section
      }
    }))

    await this.vectorStore.upsertVectors(vectors)
    return { success: true, message: `Indexed ${chunks.length} chunks from ${files.length} files`, chunksIndexed: chunks.length }
  }

  private async walk(dir: string, out: string[], input: Input): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        if (this.isExcluded(e.name, input)) continue
        await this.walk(p, out, input)
      } else if (e.isFile()) {
        if (this.isIncluded(e.name, input) && !this.isExcluded(e.name, input)) out.push(p)
      }
    }
  }

  private isIncluded(name: string, input: Input): boolean {
    const inc = input.include
    if (!inc || inc.length === 0) return this.defaultInclude(name)
    return inc.some(glob => this.matches(name, glob))
  }

  private defaultInclude(name: string): boolean {
    // Include common text/code files by default
    return /(\.([tj]sx?|md|json|ya?ml|toml|py|java|c(pp|xx)?|cs|go|rs|kt|swift|scala|css|scss|less|html))$/i.test(name)
  }

  private isExcluded(name: string, input: Input): boolean {
    const exc = input.exclude || ['node_modules/**', '.git/**', 'dist/**', 'build/**']
    return exc.some(glob => this.matches(name, glob))
  }

  private matches(name: string, pattern: string): boolean {
    const esc = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\\\*\*?/g, '.*')
    const re = new RegExp('^' + esc + '$')
    return re.test(name)
  }

  private detectLanguage(file: string): string {
    const ext = file.split('.').pop()?.toLowerCase() || ''
    const map: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', md: 'markdown', json: 'json', py: 'python', java: 'java', cpp: 'cpp', c: 'c', cs: 'csharp', go: 'go', rs: 'rust', kt: 'kotlin', swift: 'swift', scala: 'scala', css: 'css', scss: 'scss', html: 'html', yml: 'yaml', yaml: 'yaml' }
    return map[ext] || 'text'
  }
}


