import type { ImageResult, SearchQuality } from './types'
import { buildEnhancedQueries, matchesQuality, sortByResolution } from './query'

interface DdgImage {
  title?: string
  image?: string
  thumbnail?: string
  url?: string
  source?: string
  width?: number
  height?: number
}

function stableId(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i += 1)
    hash = Math.imul(31, hash) + input.charCodeAt(i) | 0

  return Math.abs(hash).toString(36)
}

async function getVqd(query: string) {
  const response = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`)
  const html = await response.text()
  const match = html.match(/vqd=['"]?([^'"&\s]+)['"]?/)
  if (!match?.[1])
    throw new Error('未能从 DuckDuckGo 响应中提取搜索令牌')

  return match[1]
}

async function searchSingleQuery(query: string) {
  const vqd = await getVqd(query)
  const url = new URL('https://duckduckgo.com/i.js')
  url.searchParams.set('l', 'wt-wt')
  url.searchParams.set('o', 'json')
  url.searchParams.set('q', query)
  url.searchParams.set('vqd', vqd)
  url.searchParams.set('f', ',,,')
  url.searchParams.set('p', '1')

  const response = await fetch(url, {
    headers: {
      accept: 'application/json, text/javascript, */*; q=0.01',
      referer: 'https://duckduckgo.com/',
    },
  })
  if (!response.ok)
    throw new Error(`DuckDuckGo 图片接口返回 ${response.status}`)

  const payload = await response.json() as { results?: DdgImage[] }
  return payload.results ?? []
}

async function probeImage(imageUrl: string) {
  try {
    const response = await fetch(imageUrl, {
      headers: { range: 'bytes=0-2047' },
      signal: AbortSignal.timeout(9000),
    })
    const contentType = response.headers.get('content-type') ?? ''
    return {
      accessible: response.ok && contentType.startsWith('image/'),
      contentType,
    }
  }
  catch {
    return { accessible: false, contentType: undefined }
  }
}

export async function searchDuckDuckGoImages(query: string, quality: SearchQuality) {
  const queries = buildEnhancedQueries(query)
  const settled = await Promise.allSettled(queries.map(searchSingleQuery))
  const seen = new Set<string>()
  const candidates: ImageResult[] = []

  for (const result of settled) {
    if (result.status !== 'fulfilled')
      continue

    for (const item of result.value) {
      if (!item.image || seen.has(item.image))
        continue

      const width = Number(item.width ?? 0)
      const height = Number(item.height ?? 0)
      const normalized: ImageResult = {
        id: stableId(item.image),
        title: item.title || '未命名图片',
        imageUrl: item.image,
        thumbnailUrl: item.thumbnail || item.image,
        pageUrl: item.url || item.image,
        source: item.source || new URL(item.url || item.image).hostname,
        provider: 'duckduckgo',
        width,
        height,
        accessible: false,
      }

      if (!matchesQuality(normalized, quality))
        continue

      seen.add(item.image)
      candidates.push(normalized)
    }
  }

  const topCandidates = candidates.sort(sortByResolution).slice(0, 80)
  const probed = await Promise.all(topCandidates.map(async (item) => {
    const probe = await probeImage(item.imageUrl)
    return { ...item, ...probe }
  }))

  return probed.filter(item => item.accessible).sort(sortByResolution)
}
