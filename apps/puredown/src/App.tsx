import type { DownloadRecord, ImageResult, SearchQuality, SearchSource } from '@/features/search/types'
import { Download, ExternalLink, History, ImageDown, Loader2, Search, ShieldAlert, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { deleteDownloadRecord, downloadImage, listDownloadHistory, openDownloadedImage, searchImages } from '@/features/search/api'

const qualityOptions: Array<{ value: SearchQuality, label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'hires', label: '高清' },
  { value: 'twoK', label: '2K+' },
  { value: 'portrait', label: '竖屏壁纸' },
  { value: 'landscape', label: '横屏壁纸' },
]

const sourceOptions: Array<{ value: SearchSource, label: string }> = [
  { value: 'duckduckgo', label: 'DuckDuckGo Images' },
  { value: 'pexels', label: 'Pexels 素材' },
]

function resolutionLabel(item: Pick<ImageResult, 'width' | 'height'>) {
  if (!item.width || !item.height)
    return '未知尺寸'

  return `${item.width} x ${item.height}`
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  }
  catch {
    return '未知来源'
  }
}

function App() {
  const [query, setQuery] = useState('')
  const [quality, setQuality] = useState<SearchQuality>('hires')
  const [source, setSource] = useState<SearchSource>('duckduckgo')
  const [results, setResults] = useState<ImageResult[]>([])
  const [history, setHistory] = useState<DownloadRecord[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string>()
  const [pendingDownload, setPendingDownload] = useState<ImageResult>()

  const bestResult = useMemo(() => results[0], [results])

  async function refreshHistory() {
    setHistory(await listDownloadHistory())
  }

  async function handleSearch() {
    const trimmed = query.trim()
    if (!trimmed)
      return

    setIsSearching(true)
    setError(undefined)
    try {
      const nextResults = await searchImages({ query: trimmed, quality, source })
      setResults(nextResults)
      if (nextResults.length === 0)
        setError('没有找到满足当前清晰度条件的可访问图片，可以切换到“全部”或换一个关键词。')
    }
    catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败')
    }
    finally {
      setIsSearching(false)
    }
  }

  async function confirmDownload() {
    if (!pendingDownload)
      return

    setIsDownloading(true)
    setError(undefined)
    try {
      await downloadImage(pendingDownload)
      await refreshHistory()
      setPendingDownload(undefined)
    }
    catch (err) {
      setError(err instanceof Error ? err.message : '下载失败')
    }
    finally {
      setIsDownloading(false)
    }
  }

  async function handleDeleteHistory(id: string) {
    setHistory(await deleteDownloadRecord(id))
  }

  useEffect(() => {
    refreshHistory().catch(() => setHistory([]))
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-br from-stone-50 via-[#f8f9f5] to-emerald-50/60 text-stone-900 font-sans selection:bg-emerald-200 selection:text-emerald-900 transition-colors duration-500">
      <section className="sticky top-0 z-50 border-b border-stone-200/50 bg-white/70 backdrop-blur-xl shadow-sm transition-all duration-300">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <Badge className="border-emerald-200 bg-emerald-100/50 text-emerald-800 shadow-sm px-3 py-1 text-xs font-medium rounded-full inline-flex items-center backdrop-blur-sm">
                <Sparkles aria-hidden="true" className="mr-1.5 size-3.5 text-emerald-600 animate-pulse" />
                高清增强搜索
              </Badge>
              <div>
                <h1 translate="no" className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-stone-900 via-stone-800 to-emerald-800 sm:text-5xl text-balance">
                  PureDown
                </h1>
                <p className="mt-3 text-base leading-relaxed text-stone-500 max-w-xl text-pretty">
                  自动扩展多语言关键词，智能过滤低质量内容，验证原图可访问性，并为您安全保存下载历史。
                </p>
              </div>
            </div>
            {bestResult && (
              <div className="rounded-2xl border border-emerald-100/60 bg-emerald-50/50 px-5 py-3 text-sm text-emerald-800 shadow-sm backdrop-blur-sm flex items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <span className="opacity-80">最高分辨率:</span>
                <span className="ml-2 font-bold tracking-wide text-emerald-900 tabular-nums">{resolutionLabel(bestResult)}</span>
              </div>
            )}
          </div>

          <Card className="border-stone-200/60 bg-white/80 shadow-lg shadow-stone-200/40 backdrop-blur-md ring-1 ring-stone-900/5 transition-[box-shadow,transform] duration-300 hover:shadow-xl hover:shadow-emerald-900/5 rounded-2xl overflow-hidden mt-2">
            <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_180px_180px_auto]">
              <label className="space-y-2" htmlFor="puredown-search-query">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 ml-1">关键词</span>
                <Input
                  id="puredown-search-query"
                  name="query"
                  autoComplete="off"
                  className="h-12 rounded-xl bg-stone-50/50 border-stone-200/80 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500 transition-colors"
                  value={query}
                  placeholder="输入人物、壁纸或素材关键词…"
                  onChange={event => setQuery(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && handleSearch()}
                />
              </label>

              <label className="space-y-2" htmlFor="puredown-source-select">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 ml-1">图源</span>
                <div className="relative">
                  <select
                    id="puredown-source-select"
                    className="h-12 w-full rounded-xl border border-stone-200/80 bg-stone-50/50 px-4 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 hover:border-emerald-300 cursor-pointer appearance-none"
                    value={source}
                    onChange={event => setSource(event.target.value as SearchSource)}
                  >
                    {sourceOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </label>

              <label className="space-y-2" htmlFor="puredown-quality-select">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 ml-1">质量</span>
                <div className="relative">
                  <select
                    id="puredown-quality-select"
                    className="h-12 w-full rounded-xl border border-stone-200/80 bg-stone-50/50 px-4 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 hover:border-emerald-300 cursor-pointer appearance-none"
                    value={quality}
                    onChange={event => setQuality(event.target.value as SearchQuality)}
                  >
                    {qualityOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </label>

              <div className="flex items-end">
                <Button id="puredown-search-submit" className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-[box-shadow,transform,background-color] active:scale-[0.98] font-medium" onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? <Loader2 aria-hidden="true" className="mr-2 size-5 animate-spin" /> : <Search aria-hidden="true" className="mr-2 size-5" />}
                  {isSearching ? '搜索中…' : '搜索高清图'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Tabs defaultValue="results">
          <div className="flex justify-center md:justify-start mb-6">
            <TabsList id="puredown-main-tabs" className="bg-stone-200/50 p-1 rounded-2xl backdrop-blur-md">
              <TabsTrigger id="puredown-tab-results" value="results" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm px-6 py-2.5 transition-[background-color,color,box-shadow]">
                <ImageDown aria-hidden="true" className="mr-2 size-4" />
                搜索结果
              </TabsTrigger>
              <TabsTrigger id="puredown-tab-history" value="history" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm px-6 py-2.5 transition-[background-color,color,box-shadow]">
                <History aria-hidden="true" className="mr-2 size-4" />
                下载历史
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="results" className="mt-2 animate-in fade-in duration-500">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((item, index) => (
                <Card key={item.id} className="group overflow-hidden rounded-2xl border-stone-200/60 bg-white/80 shadow-sm hover:shadow-xl hover:shadow-emerald-900/10 transition-[box-shadow,transform] duration-500 hover:-translate-y-1" style={{ animationFillMode: 'both', animationDelay: `${index * 50}ms` }}>
                  <div className="aspect-[4/5] bg-stone-100 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-900/60 via-stone-900/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10 pointer-events-none" />
                    <img
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                      src={item.thumbnailUrl}
                      alt={item.title}
                      width={400}
                      height={500}
                      loading="lazy"
                    />
                    <div className="absolute bottom-3 left-3 right-3 z-20 flex flex-wrap gap-2 opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-500 translate-y-2 group-hover:translate-y-0">
                      <Badge className="bg-white/90 text-stone-900 hover:bg-white border-none shadow-sm backdrop-blur-md tabular-nums">{resolutionLabel(item)}</Badge>
                      <Badge className="bg-emerald-500/90 text-white hover:bg-emerald-500 border-none shadow-sm backdrop-blur-md">可下载</Badge>
                    </div>
                  </div>
                  <CardHeader className="pt-5 pb-3">
                    <CardTitle className="line-clamp-2 text-base leading-snug font-semibold text-stone-800 min-h-[2.75rem] group-hover:text-emerald-700 transition-colors text-balance">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pb-5">
                    <div className="flex items-center text-xs text-stone-500">
                      <span className="w-2 h-2 rounded-full bg-stone-300 mr-2 group-hover:bg-emerald-400 transition-colors" />
                      {sourceHost(item.pageUrl)}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        id={`puredown-download-${item.id}`}
                        className="flex-1 rounded-xl bg-stone-900 hover:bg-emerald-600 transition-colors shadow-sm active:scale-95"
                        size="sm"
                        onClick={() => setPendingDownload(item)}
                      >
                        <Download aria-hidden="true" className="mr-1.5 size-4" />
                        下载原图
                      </Button>
                      <Button
                        id={`puredown-open-source-${item.id}`}
                        variant="secondary"
                        className="rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 transition-colors active:scale-95"
                        size="icon"
                        aria-label="打开来源页"
                        asChild
                      >
                        <a href={item.pageUrl} target="_blank" rel="noreferrer">
                          <ExternalLink aria-hidden="true" className="size-4 text-stone-600" />
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {!isSearching && results.length === 0 && (
              <div className="flex flex-col min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-stone-300/60 bg-white/40 text-stone-500 backdrop-blur-sm">
                <div className="w-16 h-16 mb-4 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                  <Search className="size-8" />
                </div>
                <p className="text-sm font-medium">输入关键词开始探索</p>
                <p className="text-xs text-stone-400 mt-1">自动过滤低清，带给你极致视觉体验</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-2 animate-in fade-in duration-500">
            <div className="grid gap-4 lg:grid-cols-2">
              {history.map((record, index) => (
                <Card key={record.id} className="group overflow-hidden rounded-2xl border-stone-200/60 bg-white/80 shadow-sm hover:shadow-md transition-[box-shadow,transform] duration-300" style={{ animationFillMode: 'both', animationDelay: `${index * 50}ms` }}>
                  <div className="grid grid-cols-[140px_1fr] gap-5 p-4">
                    <div className="overflow-hidden rounded-xl bg-stone-100 relative">
                      <img
                        className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-110"
                        src={record.thumbnailUrl}
                        alt={record.title}
                        width={140}
                        height={128}
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 py-1 flex flex-col justify-between">
                      <div>
                        <h2 className="line-clamp-2 text-sm font-bold text-stone-800 leading-snug group-hover:text-emerald-700 transition-colors text-balance">{record.title}</h2>
                        <div className="mt-2 flex items-center text-xs text-stone-500 bg-stone-50 w-fit px-2 py-1 rounded-md tabular-nums">
                          <span className="font-medium text-stone-700">{resolutionLabel(record)}</span>
                          <span className="mx-2 opacity-30">|</span>
                          <span>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(record.downloadedAt))}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Button
                          id={`puredown-open-history-${record.id}`}
                          size="sm"
                          className="rounded-lg h-8 bg-stone-900 hover:bg-emerald-600 transition-colors active:scale-95"
                          onClick={() => openDownloadedImage(record)}
                        >
                          <ExternalLink aria-hidden="true" className="mr-1.5 size-3.5" />
                          打开
                        </Button>
                        <Button
                          id={`puredown-delete-history-${record.id}`}
                          size="sm"
                          variant="ghost"
                          className="rounded-lg h-8 text-stone-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          onClick={() => handleDeleteHistory(record.id)}
                        >
                          <Trash2 aria-hidden="true" className="mr-1.5 size-3.5" />
                          删除
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {history.length === 0 && (
              <div className="flex flex-col min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-stone-300/60 bg-white/40 text-stone-500 backdrop-blur-sm">
                <div className="w-16 h-16 mb-4 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                  <History className="size-8" />
                </div>
                <p className="text-sm font-medium">还没有下载历史</p>
                <p className="text-xs text-stone-400 mt-1">下载的美图会保存在这里</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>

      <Dialog open={Boolean(pendingDownload)} onOpenChange={open => !open && setPendingDownload(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert aria-hidden="true" className="size-5 text-amber-600" />
              下载前确认来源
            </DialogTitle>
            <DialogDescription className="text-pretty">
              <span translate="no">PureDown</span>
              {' '}
              只保存图片来源和下载历史，不声明该图片可商用。请根据来源站点规则自行确认使用权限。
            </DialogDescription>
          </DialogHeader>
          {pendingDownload && (
            <div className="mt-4 space-y-3 text-sm text-stone-600">
              <div className="rounded-md bg-stone-100 p-3">
                <div className="font-medium text-stone-950">{pendingDownload.title}</div>
                <div className="mt-1 tabular-nums">
                  {resolutionLabel(pendingDownload)}
                  {' · '}
                  {sourceHost(pendingDownload.pageUrl)}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button id="puredown-cancel-download" variant="secondary">取消</Button>
                </DialogClose>
                <Button id="puredown-confirm-download" onClick={confirmDownload} disabled={isDownloading}>
                  {isDownloading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Download aria-hidden="true" className="size-4" />}
                  确认下载
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}

export default App
