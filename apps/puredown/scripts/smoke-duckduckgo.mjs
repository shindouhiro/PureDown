import process from 'node:process'

const queries = [
  '长泽雅美',
  '长泽雅美 高清',
  '长泽雅美 壁纸',
  '长泽雅美 写真 高清',
  '長澤まさみ 高画質',
  '長澤まさみ 壁紙',
  'Masami Nagasawa high resolution',
  'Masami Nagasawa wallpaper',
]

const ua = 'Mozilla/5.0 PureDown-search-smoke/0.1'

async function getVqd(query) {
  const response = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
    headers: { 'user-agent': ua },
  })
  const html = await response.text()
  const match = html.match(/vqd=['"]?([^'"&\s]+)['"]?/)
  if (!match?.[1])
    throw new Error(`未提取到 vqd: ${query}`)

  return match[1]
}

async function search(query) {
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
      'accept': 'application/json, text/javascript, */*; q=0.01',
      'referer': 'https://duckduckgo.com/',
      'user-agent': ua,
    },
  })
  if (!response.ok)
    throw new Error(`DuckDuckGo 图片接口失败: ${response.status}`)

  const payload = await response.json()
  return payload.results ?? []
}

async function probe(imageUrl) {
  try {
    const response = await fetch(imageUrl, {
      headers: { 'user-agent': ua, 'range': 'bytes=0-2047' },
      signal: AbortSignal.timeout(9000),
    })
    const contentType = response.headers.get('content-type') ?? ''
    return response.ok && contentType.startsWith('image/')
  }
  catch {
    return false
  }
}

const results = []

for (const query of queries) {
  const items = await search(query)
  for (const item of items) {
    if (!item.image)
      continue

    const width = Number(item.width ?? 0)
    const height = Number(item.height ?? 0)
    if (width < 1200 && height < 1600)
      continue

    results.push({
      query,
      title: item.title,
      image: item.image,
      width,
      height,
      page: item.url,
    })
  }
}

const deduped = Array.from(new Map(results.map(item => [item.image, item])).values())
  .sort((a, b) => b.width * b.height - a.width * a.height)
  .slice(0, 12)

const accessible = []
for (const item of deduped) {
  if (await probe(item.image))
    accessible.push(item)
}

console.log(`query=长泽雅美`)
console.log(`hires_candidate_count=${deduped.length}`)
console.log(`accessible_hires_count=${accessible.length}`)
console.log('top_accessible=')
console.log(JSON.stringify(accessible.slice(0, 5), null, 2))

const hasEnoughResults = accessible.length > 0
const hasLargeImage = accessible.some(item =>
  (item.width >= 1920 && item.height >= 1080) || item.height > 2000,
)

if (!hasEnoughResults || !hasLargeImage) {
  console.error('高清搜索烟测失败：没有可访问的高清图片。')
  process.exit(1)
}
