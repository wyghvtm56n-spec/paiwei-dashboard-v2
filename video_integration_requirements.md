# 粉專與 Instagram 影片數據串接需求

## 使用者需要準備的資料

| 資料 | 是否可直接提供 | 用途 |
|---|---:|---|
| Facebook Page ID | 可以 | 列出粉專影片、取得連結的 Instagram Business Account |
| Instagram Professional Account ID | 可以；若不知道可只提供 Page ID | 列出 Instagram Media 並取得 Reels／貼文 Insights |
| Page access token | 不要貼在聊天 | 讀取 `/<VIDEO_ID>/video_insights` 與 `/<PAGE_ID>/videos` |
| Facebook User access token | 不要貼在聊天 | 使用 Facebook Login for Business 取得 IG User、列出 IG Media 與讀取 Media Insights |
| Meta App Review 狀態 | 可以說明 | 若不是 App 管理者、開發者或測試者，正式帳號需通過對應權限審查 |

## 最小權限

### Facebook 粉專影片

建議使用 Page access token，對應的 Facebook User 必須能對該 Page 執行 `ANALYZE`；需要 `pages_read_engagement`。若同時要列出粉專影片，官方 Get Videos 文件對可管理的 Page 使用 `MANAGE` task 情境，並仍要求 `pages_read_engagement`。

### Instagram Reels／貼文

本專案建議採用 Instagram API with Facebook Login，因為它可使用 `graph.facebook.com` 並支援 Facebook Login 流程的 total metrics。Facebook User access token 需要 `instagram_basic`、`instagram_manage_insights` 與 `pages_read_engagement`。若使用者的 Page role 是透過 Business Manager 授予，還需要 `ads_read` 或 `ads_management`。

## Cloudflare Secrets 與 Variables

建議新增：

```text
Secret: META_CONTENT_PAGE_ACCESS_TOKEN
Secret: META_CONTENT_USER_ACCESS_TOKEN
Variable: META_CONTENT_PAGE_ID
Variable: META_CONTENT_IG_USER_ID   # 可選；留空時由 Page ID 查詢
```

現有 `META_ACCESS_TOKEN` 仍只保留給 Ads Insights，不與內容影片 token 混用。這樣可以分別撤銷內容權限與廣告權限，也能避免把影片自然互動與廣告成效混在一起。

## 首版會顯示的資料

首版會列出最近可取得的粉專影片與 Instagram Feed／Reels Media，並顯示影片／貼文名稱或文字摘要、發布日期、永久連結（若有）、來源平台、影片類型與洞察資料的更新狀態。Facebook Page Video Insights 首版採用 `total_video_views` 與 `total_video_views_unique`；Instagram Reels／貼文首版採用 `views`、`reach`、`likes`、`comments`、`saved`、`shares`、`total_interactions`，並在 Reels 可用時顯示平均觀看時間、總觀看時間與前三秒跳過率。

Instagram Insights 可能延遲最多 48 小時；若某一媒體或指標不存在，API 會回傳空資料集，不應在介面補成 0。Instagram album media 不提供 Insights；Story 的資料保存限制也不同，因此首版先排除 Story。

## 安全原則

不要把任何 Access Token 貼在對話中，也不要提交到 GitHub。最安全的流程是先把程式推到分支，再由具備 Cloudflare 權限的人執行 `wrangler secret put`。我可以協助檢查 Token 是否能取得資料，但不需要知道 Token 的完整內容。

## 官方來源

- https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights
- https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/page
- https://developers.facebook.com/documentation/video-api/guides/get-videos
- https://developers.facebook.com/documentation/video-api/guides/insights
