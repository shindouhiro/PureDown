export type SearchSource = 'duckduckgo' | 'pexels'

export type SearchQuality = 'all' | 'hires' | 'twoK' | 'portrait' | 'landscape'

export interface SearchRequest {
  query: string
  source: SearchSource
  quality: SearchQuality
}

export interface ImageResult {
  id: string
  title: string
  imageUrl: string
  thumbnailUrl: string
  pageUrl: string
  source: string
  provider: SearchSource
  width: number
  height: number
  accessible: boolean
  contentType?: string
}

export interface DownloadRecord {
  id: string
  title: string
  imageUrl: string
  thumbnailUrl: string
  pageUrl: string
  source: string
  provider: SearchSource
  width: number
  height: number
  filePath?: string
  fileSize?: number
  downloadedAt: string
}
