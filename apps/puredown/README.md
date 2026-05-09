# PureDown

PureDown 是一个 React 19 + Tauri v2 高清图搜索器。

## 功能

- 默认使用 DuckDuckGo Images 无 Key 搜索。
- 自动扩展中文、日文、英文高清关键词。
- 过滤低清图片，按像素面积排序，并探测原图是否可访问。
- 支持下载历史、来源查看和本地图片快速打开。
- Pexels 作为可选素材源，需要设置 `PEXELS_API_KEY`。

## 开发

```bash
pnpm install
pnpm dev
```

## Tauri

```bash
pnpm tauri:dev
pnpm tauri:build
```

如果系统里 Homebrew Rust 优先级高于 rustup，请使用新版 Rust：

```bash
PATH="$HOME/.cargo/bin:$PATH" pnpm tauri:build
```

## 验证

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:search
```
