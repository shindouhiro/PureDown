use futures_util::{stream, StreamExt};
use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE, RANGE, REFERER, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, Runtime};
use thiserror::Error;
use url::Url;

const USER_AGENT_VALUE: &str = "Mozilla/5.0 PureDown/0.1";
const MAX_PROBE_ITEMS: usize = 80;

#[derive(Debug, Error)]
enum AppError {
    #[error("网络请求失败：{0}")]
    Request(#[from] reqwest::Error),
    #[error("文件读写失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("JSON 处理失败：{0}")]
    Json(#[from] serde_json::Error),
    #[error("URL 解析失败：{0}")]
    Url(#[from] url::ParseError),
    #[error("{0}")]
    Message(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchRequest {
    query: String,
    source: SearchSource,
    quality: SearchQuality,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum SearchSource {
    Duckduckgo,
    Pexels,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum SearchQuality {
    All,
    Hires,
    TwoK,
    Portrait,
    Landscape,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageResult {
    id: String,
    title: String,
    image_url: String,
    thumbnail_url: String,
    page_url: String,
    source: String,
    provider: SearchSource,
    width: u32,
    height: u32,
    accessible: bool,
    content_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadRecord {
    id: String,
    title: String,
    image_url: String,
    thumbnail_url: String,
    page_url: String,
    source: String,
    provider: SearchSource,
    width: u32,
    height: u32,
    file_path: Option<String>,
    file_size: Option<u64>,
    downloaded_at: String,
}

#[derive(Debug, Deserialize)]
struct DdgResponse {
    #[serde(default)]
    results: Vec<DdgImage>,
}

#[derive(Debug, Deserialize)]
struct DdgImage {
    title: Option<String>,
    image: Option<String>,
    thumbnail: Option<String>,
    url: Option<String>,
    source: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct PexelsResponse {
    #[serde(default)]
    photos: Vec<PexelsPhoto>,
}

#[derive(Debug, Deserialize)]
struct PexelsPhoto {
    id: u64,
    width: u32,
    height: u32,
    url: String,
    photographer: String,
    src: PexelsSrc,
    alt: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PexelsSrc {
    original: String,
    large2x: Option<String>,
    medium: Option<String>,
}

fn now_millis() -> AppResult<u128> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Message(format!("系统时间异常：{error}")))?
        .as_millis())
}

fn now_iso_like() -> AppResult<String> {
    Ok(format!("{}", now_millis()?))
}

fn stable_id(input: &str) -> String {
    let mut hash: u32 = 2_166_136_261;
    for byte in input.bytes() {
        hash ^= u32::from(byte);
        hash = hash.wrapping_mul(16_777_619);
    }
    format!("{hash:x}")
}

fn app_data_dir<R: Runtime>(app: &tauri::AppHandle<R>) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Message(format!("无法获取应用数据目录：{error}")))?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn history_path<R: Runtime>(app: &tauri::AppHandle<R>) -> AppResult<PathBuf> {
    Ok(app_data_dir(app)?.join("history.json"))
}

fn images_dir<R: Runtime>(app: &tauri::AppHandle<R>) -> AppResult<PathBuf> {
    let dir = app_data_dir(app)?.join("images");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn read_history<R: Runtime>(app: &tauri::AppHandle<R>) -> AppResult<Vec<DownloadRecord>> {
    let path = history_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let raw = fs::read_to_string(path)?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }

    Ok(serde_json::from_str(&raw)?)
}

fn write_history<R: Runtime>(app: &tauri::AppHandle<R>, records: &[DownloadRecord]) -> AppResult<()> {
    fs::write(history_path(app)?, serde_json::to_vec_pretty(records)?)?;
    Ok(())
}

fn default_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_VALUE));
    headers
}

fn build_enhanced_queries(raw_query: &str) -> Vec<String> {
    let query = raw_query.trim();
    if query.is_empty() {
        return Vec::new();
    }

    let mut alias_map: HashMap<&str, Vec<&str>> = HashMap::new();
    alias_map.insert("长泽雅美", vec!["長澤まさみ", "Masami Nagasawa"]);
    alias_map.insert("長澤まさみ", vec!["长泽雅美", "Masami Nagasawa"]);
    alias_map.insert("masami nagasawa", vec!["长泽雅美", "長澤まさみ"]);

    let mut bases = vec![query.to_string()];
    let lookup = query.to_lowercase();
    if let Some(aliases) = alias_map.get(query).or_else(|| alias_map.get(lookup.as_str())) {
        bases.extend(aliases.iter().map(|item| item.to_string()));
    }

    let mut seen = HashSet::new();
    let mut variants = Vec::new();
    for base in bases {
        let is_ascii = base.is_ascii();
        let is_japanese = base.chars().any(|ch| ('\u{3040}'..='\u{30ff}').contains(&ch));
        let additions = if is_ascii {
            vec![base.clone(), format!("{base} high resolution"), format!("{base} wallpaper")]
        } else if is_japanese {
            vec![base.clone(), format!("{base} 高画質"), format!("{base} 壁紙")]
        } else {
            vec![
                base.clone(),
                format!("{base} 高清"),
                format!("{base} 壁纸"),
                format!("{base} 写真 高清"),
            ]
        };

        for item in additions {
            if seen.insert(item.clone()) {
                variants.push(item);
            }
        }
    }

    variants
}

fn matches_quality(width: u32, height: u32, quality: SearchQuality) -> bool {
    let area = u64::from(width) * u64::from(height);
    match quality {
        SearchQuality::All => true,
        SearchQuality::Hires => width >= 1200 || height >= 1600,
        SearchQuality::TwoK => width >= 2000 || height >= 2000 || area >= 2560 * 1440,
        SearchQuality::Portrait => height >= 1600 && f64::from(height) >= f64::from(width) * 1.2,
        SearchQuality::Landscape => width >= 1920 && f64::from(width) >= f64::from(height) * 1.2,
    }
}

fn sort_by_resolution(items: &mut [ImageResult]) {
    items.sort_by(|a, b| {
        let left = u64::from(a.width) * u64::from(a.height);
        let right = u64::from(b.width) * u64::from(b.height);
        right.cmp(&left)
    });
}

async fn ddg_vqd(client: &reqwest::Client, query: &str) -> AppResult<String> {
    let url = format!(
        "https://duckduckgo.com/?q={}&iax=images&ia=images",
        url::form_urlencoded::byte_serialize(query.as_bytes()).collect::<String>()
    );
    let html = client
        .get(url)
        .headers(default_headers())
        .send()
        .await?
        .text()
        .await?;
    let regex = Regex::new(r#"vqd=['"]?([^'"&\s]+)['"]?"#)
        .map_err(|error| AppError::Message(format!("搜索令牌正则初始化失败：{error}")))?;
    regex
        .captures(&html)
        .and_then(|captures| captures.get(1))
        .map(|token| token.as_str().to_string())
        .ok_or_else(|| AppError::Message("未能从 DuckDuckGo 响应中提取搜索令牌".to_string()))
}

async fn search_ddg_query(client: &reqwest::Client, query: String) -> AppResult<Vec<DdgImage>> {
    let vqd = ddg_vqd(client, &query).await?;
    let mut url = Url::parse("https://duckduckgo.com/i.js")?;
    url.query_pairs_mut()
        .append_pair("l", "wt-wt")
        .append_pair("o", "json")
        .append_pair("q", &query)
        .append_pair("vqd", &vqd)
        .append_pair("f", ",,,")
        .append_pair("p", "1");

    let mut headers = default_headers();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json, text/javascript, */*; q=0.01"));
    headers.insert(REFERER, HeaderValue::from_static("https://duckduckgo.com/"));

    let response = client.get(url).headers(headers).send().await?;
    if !response.status().is_success() {
        return Err(AppError::Message(format!(
            "DuckDuckGo 图片接口返回 {}",
            response.status()
        )));
    }

    Ok(response.json::<DdgResponse>().await?.results)
}

fn host_from_url(url: &str) -> String {
    Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(|host| host.trim_start_matches("www.").to_string()))
        .unwrap_or_else(|| "未知来源".to_string())
}

async fn probe_image(client: &reqwest::Client, item: ImageResult) -> ImageResult {
    let mut headers = default_headers();
    headers.insert(RANGE, HeaderValue::from_static("bytes=0-2047"));
    match client.get(&item.image_url).headers(headers).send().await {
        Ok(response) => {
            let content_type = response
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .map(|value| value.to_string());
            let accessible = response.status().is_success()
                && content_type
                    .as_deref()
                    .is_some_and(|value| value.starts_with("image/"));
            ImageResult {
                accessible,
                content_type,
                ..item
            }
        }
        Err(_) => ImageResult {
            accessible: false,
            ..item
        },
    }
}

async fn search_duckduckgo(client: &reqwest::Client, query: &str, quality: SearchQuality) -> AppResult<Vec<ImageResult>> {
    let queries = build_enhanced_queries(query);
    let mut all_results = Vec::new();
    for result in stream::iter(queries.into_iter().map(|item| search_ddg_query(client, item)))
        .buffer_unordered(4)
        .collect::<Vec<_>>()
        .await
    {
        if let Ok(items) = result {
            all_results.extend(items);
        }
    }

    let mut seen = HashSet::new();
    let mut candidates = Vec::new();
    for item in all_results {
        let Some(image_url) = item.image else {
            continue;
        };
        if !seen.insert(image_url.clone()) {
            continue;
        }

        let width = item.width.unwrap_or_default();
        let height = item.height.unwrap_or_default();
        if !matches_quality(width, height, quality) {
            continue;
        }

        let page_url = item.url.clone().unwrap_or_else(|| image_url.clone());
        candidates.push(ImageResult {
            id: stable_id(&image_url),
            title: item.title.unwrap_or_else(|| "未命名图片".to_string()),
            image_url,
            thumbnail_url: item.thumbnail.unwrap_or_else(|| page_url.clone()),
            page_url: page_url.clone(),
            source: item.source.unwrap_or_else(|| host_from_url(&page_url)),
            provider: SearchSource::Duckduckgo,
            width,
            height,
            accessible: false,
            content_type: None,
        });
    }

    sort_by_resolution(&mut candidates);
    candidates.truncate(MAX_PROBE_ITEMS);

    let mut probed = stream::iter(candidates.into_iter().map(|item| probe_image(client, item)))
        .buffer_unordered(8)
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .filter(|item| item.accessible)
        .collect::<Vec<_>>();

    sort_by_resolution(&mut probed);
    Ok(probed)
}

async fn search_pexels(client: &reqwest::Client, query: &str, quality: SearchQuality) -> AppResult<Vec<ImageResult>> {
    let api_key = std::env::var("PEXELS_API_KEY").map_err(|_| {
        AppError::Message("Pexels 素材源需要设置 PEXELS_API_KEY 环境变量。".to_string())
    })?;
    let mut url = Url::parse("https://api.pexels.com/v1/search")?;
    url.query_pairs_mut()
        .append_pair("query", query)
        .append_pair("per_page", "60")
        .append_pair("page", "1");

    let mut headers = default_headers();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&api_key).map_err(|error| {
        AppError::Message(format!("Pexels API Key 无效：{error}"))
    })?);

    let response = client.get(url).headers(headers).send().await?;
    if !response.status().is_success() {
        return Err(AppError::Message(format!("Pexels API 返回 {}", response.status())));
    }

    let mut items = response
        .json::<PexelsResponse>()
        .await?
        .photos
        .into_iter()
        .filter(|photo| matches_quality(photo.width, photo.height, quality))
        .map(|photo| {
            let image_url = photo.src.original.clone();
            ImageResult {
                id: format!("pexels-{}", photo.id),
                title: photo.alt.unwrap_or_else(|| format!("Pexels 图片 {}", photo.id)),
                image_url: image_url.clone(),
                thumbnail_url: photo.src.large2x.or(photo.src.medium).unwrap_or(image_url),
                page_url: photo.url,
                source: photo.photographer,
                provider: SearchSource::Pexels,
                width: photo.width,
                height: photo.height,
                accessible: true,
                content_type: Some("image/jpeg".to_string()),
            }
        })
        .collect::<Vec<_>>();

    sort_by_resolution(&mut items);
    Ok(items)
}

fn extension_from_content_type(content_type: Option<&str>, image_url: &str) -> &'static str {
    match content_type.unwrap_or_default().split(';').next().unwrap_or_default() {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/avif" => "avif",
        "image/gif" => "gif",
        "image/jpeg" | "image/jpg" => "jpg",
        _ if image_url.to_lowercase().contains(".png") => "png",
        _ if image_url.to_lowercase().contains(".webp") => "webp",
        _ if image_url.to_lowercase().contains(".avif") => "avif",
        _ => "jpg",
    }
}

#[tauri::command]
async fn search_images(request: SearchRequest) -> AppResult<Vec<ImageResult>> {
    let query = request.query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(8))
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    match request.source {
        SearchSource::Duckduckgo => search_duckduckgo(&client, query, request.quality).await,
        SearchSource::Pexels => search_pexels(&client, query, request.quality).await,
    }
}

#[tauri::command]
async fn download_image<R: Runtime>(app: tauri::AppHandle<R>, item: ImageResult) -> AppResult<DownloadRecord> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(8))
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    let response = client
        .get(&item.image_url)
        .headers(default_headers())
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(AppError::Message(format!("原图下载失败：{}", response.status())));
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let extension = extension_from_content_type(content_type.as_deref(), &item.image_url);
    let bytes = response.bytes().await?;
    let filename = format!("{}-{}.{}", now_millis()?, item.id, extension);
    let path = images_dir(&app)?.join(filename);
    fs::write(&path, &bytes)?;

    let mut history = read_history(&app)?;
    history.retain(|record| record.id != item.id);

    let record = DownloadRecord {
        id: item.id,
        title: item.title,
        image_url: item.image_url,
        thumbnail_url: item.thumbnail_url,
        page_url: item.page_url,
        source: item.source,
        provider: item.provider,
        width: item.width,
        height: item.height,
        file_path: Some(path.to_string_lossy().to_string()),
        file_size: Some(bytes.len() as u64),
        downloaded_at: now_iso_like()?,
    };

    history.insert(0, record.clone());
    write_history(&app, &history)?;
    Ok(record)
}

#[tauri::command]
fn list_download_history<R: Runtime>(app: tauri::AppHandle<R>) -> AppResult<Vec<DownloadRecord>> {
    read_history(&app)
}

#[tauri::command]
fn delete_download_record<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    delete_file: bool,
) -> AppResult<Vec<DownloadRecord>> {
    let mut history = read_history(&app)?;
    let removed_paths = history
        .iter()
        .filter(|record| record.id == id)
        .filter_map(|record| record.file_path.clone())
        .collect::<Vec<_>>();

    history.retain(|record| record.id != id);
    if delete_file {
        for path in removed_paths {
            let _ = fs::remove_file(path);
        }
    }

    write_history(&app, &history)?;
    Ok(history)
}

#[tauri::command]
fn open_downloaded_image(file_path: String) -> AppResult<()> {
    #[cfg(desktop)]
    {
        open::that(&file_path).map_err(|error| AppError::Message(format!("无法打开图片：{error}")))?;
    }

    #[cfg(mobile)]
    {
        let _ = file_path;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            search_images,
            download_image,
            list_download_history,
            delete_download_record,
            open_downloaded_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_masami_nagasawa_queries() {
        let queries = build_enhanced_queries("长泽雅美");
        assert!(queries.contains(&"长泽雅美 高清".to_string()));
        assert!(queries.contains(&"長澤まさみ 高画質".to_string()));
        assert!(queries.contains(&"Masami Nagasawa high resolution".to_string()));
    }

    #[test]
    fn quality_filter_keeps_hires_images() {
        assert!(!matches_quality(800, 600, SearchQuality::Hires));
        assert!(matches_quality(1920, 1080, SearchQuality::Hires));
        assert!(matches_quality(1080, 2200, SearchQuality::Portrait));
        assert!(matches_quality(2560, 1440, SearchQuality::Landscape));
    }
}
