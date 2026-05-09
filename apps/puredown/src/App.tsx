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
  const [query, setQuery] = useState('长泽雅美')
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
    <main className="min-h-screen bg-[#f6f7f2] text-stone-950">
      <section className="border-b border-stone-200 bg-white/85">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <Badge className="border-emerald-900/20 bg-emerald-50 text-emerald-900">
                <Sparkles className="mr-1 size-3.5" />
                高清增强搜索
              </Badge>
              <div>
                <h1 className="text-3xl font-semibold tracking-normal text-stone-950 sm:text-4xl">
                  PureDown 高清图搜索器
                </h1>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  自动扩展多语言关键词，过滤低清图，验证原图可访问，再保存下载历史。
                </p>
              </div>
            </div>
            {bestResult && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                当前最高分辨率：
                <span className="ml-2 font-semibold text-stone-950">{resolutionLabel(bestResult)}</span>
              </div>
            )}
          </div>

          <Card className="border-stone-200 bg-[#fbfbf8]">
            <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_180px_180px_auto]">
              <label className="space-y-1.5" htmlFor="puredown-search-query">
                <span className="text-xs font-medium text-stone-600">关键词</span>
                <Input
                  id="puredown-search-query"
                  value={query}
                  placeholder="输入人物、壁纸或素材关键词"
                  onChange={event => setQuery(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && handleSearch()}
                />
              </label>

              <label className="space-y-1.5" htmlFor="puredown-source-select">
                <span className="text-xs font-medium text-stone-600">图源</span>
                <select
                  id="puredown-source-select"
                  className="h-11 w-full rounded-md border border-stone-300 bg-white/90 px-3 text-sm outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20"
                  value={source}
                  onChange={event => setSource(event.target.value as SearchSource)}
                >
                  {sourceOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5" htmlFor="puredown-quality-select">
                <span className="text-xs font-medium text-stone-600">质量</span>
                <select
                  id="puredown-quality-select"
                  className="h-11 w-full rounded-md border border-stone-300 bg-white/90 px-3 text-sm outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20"
                  value={quality}
                  onChange={event => setQuality(event.target.value as SearchQuality)}
                >
                  {qualityOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <div className="flex items-end">
                <Button id="puredown-search-submit" className="w-full" onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                  搜索高清图
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

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Tabs defaultValue="results">
          <TabsList id="puredown-main-tabs">
            <TabsTrigger id="puredown-tab-results" value="results">
              <ImageDown className="mr-2 size-4" />
              搜索结果
            </TabsTrigger>
            <TabsTrigger id="puredown-tab-history" value="history">
              <History className="mr-2 size-4" />
              下载历史
            </TabsTrigger>
          </TabsList>

          <TabsContent value="results">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map(item => (
                <Card key={item.id} className="overflow-hidden">
                  <div className="aspect-[4/5] bg-stone-100">
                    <img
                      className="size-full object-cover"
                      src={item.thumbnailUrl}
                      alt={item.title}
                      loading="lazy"
                    />
                  </div>
                  <CardHeader>
                    <CardTitle className="line-clamp-2 min-h-10">{item.title}</CardTitle>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{resolutionLabel(item)}</Badge>
                      <Badge className="bg-emerald-50 text-emerald-800">可下载</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-stone-500">
                      来源：
                      {sourceHost(item.pageUrl)}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        id={`puredown-download-${item.id}`}
                        className="flex-1"
                        size="sm"
                        onClick={() => setPendingDownload(item)}
                      >
                        <Download className="size-4" />
                        下载
                      </Button>
                      <Button
                        id={`puredown-open-source-${item.id}`}
                        variant="secondary"
                        size="icon"
                        aria-label="打开来源页"
                        onClick={() => window.open(item.pageUrl, '_blank', 'noreferrer')}
                      >
                        <ExternalLink className="size-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {!isSearching && results.length === 0 && (
              <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white/60 text-sm text-stone-500">
                输入关键词后开始搜索，默认会过滤低清和不可访问图片。
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            <div className="grid gap-4 lg:grid-cols-2">
              {history.map(record => (
                <Card key={record.id} className="overflow-hidden">
                  <div className="grid grid-cols-[120px_1fr] gap-4 p-3">
                    <img
                      className="h-32 w-full rounded-md object-cover"
                      src={record.thumbnailUrl}
                      alt={record.title}
                      loading="lazy"
                    />
                    <div className="min-w-0 space-y-3">
                      <div>
                        <h2 className="line-clamp-2 text-sm font-semibold text-stone-950">{record.title}</h2>
                        <p className="mt-1 text-xs text-stone-500">
                          {resolutionLabel(record)}
                          {' · '}
                          {new Date(record.downloadedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          id={`puredown-open-history-${record.id}`}
                          size="sm"
                          onClick={() => openDownloadedImage(record)}
                        >
                          <ExternalLink className="size-4" />
                          打开
                        </Button>
                        <Button
                          id={`puredown-delete-history-${record.id}`}
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteHistory(record.id)}
                        >
                          <Trash2 className="size-4" />
                          删除记录
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {history.length === 0 && (
              <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white/60 text-sm text-stone-500">
                下载后会在这里显示历史记录和快速打开入口。
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>

      <Dialog open={Boolean(pendingDownload)} onOpenChange={open => !open && setPendingDownload(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-amber-600" />
              下载前确认来源
            </DialogTitle>
            <DialogDescription>
              PureDown 只保存图片来源和下载历史，不声明该图片可商用。请根据来源站点规则自行确认使用权限。
            </DialogDescription>
          </DialogHeader>
          {pendingDownload && (
            <div className="mt-4 space-y-3 text-sm text-stone-600">
              <div className="rounded-md bg-stone-100 p-3">
                <div className="font-medium text-stone-950">{pendingDownload.title}</div>
                <div className="mt-1">
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
                  {isDownloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
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
