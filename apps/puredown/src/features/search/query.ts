import type { ImageResult, SearchQuality } from './types'

const aliasMap = new Map<string, string[]>([
  ['长泽雅美', ['長澤まさみ', 'Masami Nagasawa']],
  ['長澤まさみ', ['长泽雅美', 'Masami Nagasawa']],
  ['masami nagasawa', ['长泽雅美', '長澤まさみ']],
])

export function buildEnhancedQueries(rawQuery: string) {
  const query = rawQuery.trim()
  if (!query)
    return []

  const lower = query.toLowerCase()
  const aliases = aliasMap.get(query) ?? aliasMap.get(lower) ?? []
  const bases = Array.from(new Set([query, ...aliases]))
  const variants = bases.flatMap((base) => {
    const isAscii = [...base].every(char => char.charCodeAt(0) <= 0x7F)
    const isJapanese = /[\u3040-\u30FF]/.test(base)

    if (isAscii)
      return [base, `${base} high resolution`, `${base} wallpaper`]

    if (isJapanese)
      return [base, `${base} 高画質`, `${base} 壁紙`]

    return [base, `${base} 高清`, `${base} 壁纸`, `${base} 写真 高清`]
  })

  return Array.from(new Set(variants))
}

export function matchesQuality(item: Pick<ImageResult, 'width' | 'height'>, quality: SearchQuality) {
  const { width, height } = item
  const area = width * height

  if (quality === 'all')
    return true
  if (quality === 'hires')
    return width >= 1200 || height >= 1600
  if (quality === 'twoK')
    return width >= 2000 || height >= 2000 || area >= 2560 * 1440
  if (quality === 'portrait')
    return height >= 1600 && height >= width * 1.2
  if (quality === 'landscape')
    return width >= 1920 && width >= height * 1.2

  return true
}

export function sortByResolution(a: Pick<ImageResult, 'width' | 'height'>, b: Pick<ImageResult, 'width' | 'height'>) {
  return b.width * b.height - a.width * a.height
}
