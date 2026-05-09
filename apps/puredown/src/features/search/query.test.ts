import { describe, expect, it } from 'vitest'
import { buildEnhancedQueries, matchesQuality, sortByResolution } from './query'

describe('高清搜索增强', () => {
  it('为长泽雅美生成中文、日文和英文增强查询', () => {
    expect(buildEnhancedQueries('长泽雅美')).toEqual(expect.arrayContaining([
      '长泽雅美',
      '长泽雅美 高清',
      '长泽雅美 壁纸',
      '长泽雅美 写真 高清',
      '長澤まさみ 高画質',
      'Masami Nagasawa high resolution',
      'Masami Nagasawa wallpaper',
    ]))
  })

  it('过滤低清图并保留高清图', () => {
    expect(matchesQuality({ width: 800, height: 600 }, 'hires')).toBe(false)
    expect(matchesQuality({ width: 1920, height: 1080 }, 'hires')).toBe(true)
    expect(matchesQuality({ width: 1080, height: 2200 }, 'portrait')).toBe(true)
    expect(matchesQuality({ width: 2560, height: 1440 }, 'landscape')).toBe(true)
  })

  it('按像素面积降序排序', () => {
    const sorted = [
      { width: 1200, height: 1600 },
      { width: 3008, height: 1880 },
      { width: 1920, height: 1080 },
    ].sort(sortByResolution)

    expect(sorted[0]).toEqual({ width: 3008, height: 1880 })
  })
})
