import type { DownloadRecord, ImageResult, SearchRequest } from './types'
import { invoke } from '@tauri-apps/api/core'
import { searchDuckDuckGoImages } from './web-duckduckgo'

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function readWebHistory(): DownloadRecord[] {
  const raw = localStorage.getItem('puredown.downloadHistory')
  if (!raw)
    return []

  try {
    return JSON.parse(raw) as DownloadRecord[]
  }
  catch {
    return []
  }
}

function writeWebHistory(records: DownloadRecord[]) {
  localStorage.setItem('puredown.downloadHistory', JSON.stringify(records))
}

export async function searchImages(request: SearchRequest) {
  if (isTauriRuntime())
    return invoke<ImageResult[]>('search_images', { request })

  if (request.source === 'pexels')
    throw new Error('Web 端 Pexels 需要代理接口隐藏 API Key，请在 Tauri 端或部署代理后使用。')

  return searchDuckDuckGoImages(request.query, request.quality)
}

export async function downloadImage(item: ImageResult) {
  if (isTauriRuntime())
    return invoke<DownloadRecord>('download_image', { item })

  const record: DownloadRecord = {
    ...item,
    downloadedAt: new Date().toISOString(),
  }
  writeWebHistory([record, ...readWebHistory().filter(existing => existing.id !== record.id)])

  const anchor = document.createElement('a')
  anchor.href = item.imageUrl
  anchor.target = '_blank'
  anchor.rel = 'noreferrer'
  anchor.download = ''
  anchor.click()

  return record
}

export async function listDownloadHistory() {
  if (isTauriRuntime())
    return invoke<DownloadRecord[]>('list_download_history')

  return readWebHistory()
}

export async function deleteDownloadRecord(id: string) {
  if (isTauriRuntime())
    return invoke<DownloadRecord[]>('delete_download_record', { id, deleteFile: false })

  const next = readWebHistory().filter(record => record.id !== id)
  writeWebHistory(next)
  return next
}

export async function openDownloadedImage(record: DownloadRecord) {
  if (isTauriRuntime() && record.filePath) {
    await invoke('open_downloaded_image', { filePath: record.filePath })
    return
  }

  window.open(record.filePath || record.imageUrl || record.pageUrl, '_blank', 'noreferrer')
}
