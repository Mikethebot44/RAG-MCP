import { SourceInfo } from '../types/index.js'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'

export class SourceRegistryService {
  private file: string
  private cache: Record<string, SourceInfo> = {}

  constructor(filePath?: string) {
    this.file = filePath || join(process.cwd(), '.rag-mcp', 'sources.json')
  }

  private async load(): Promise<void> {
    try {
      const buf = await readFile(this.file, 'utf8')
      this.cache = JSON.parse(buf)
    } catch {
      await mkdir(dirname(this.file), { recursive: true })
      this.cache = {}
      await this.save()
    }
  }

  private async save(): Promise<void> {
    await writeFile(this.file, JSON.stringify(this.cache, null, 2), 'utf8')
  }

  async upsert(source: SourceInfo): Promise<void> {
    await this.load()
    this.cache[source.id] = source
    await this.save()
  }

  async remove(idOrUrl: string): Promise<void> {
    await this.load()
    for (const [id, s] of Object.entries(this.cache)) {
      if (id === idOrUrl || s.url === idOrUrl) {
        delete this.cache[id]
      }
    }
    await this.save()
  }

  async all(): Promise<SourceInfo[]> {
    await this.load()
    return Object.values(this.cache)
  }
}


