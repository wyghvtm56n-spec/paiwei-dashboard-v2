# v2.1.0 粉專與 Instagram 影片洞察串接交付

**狀態：程式已完成、測試通過、已推送 GitHub；等待 Cloudflare Secrets 與 Page／Instagram ID 後即可讀取真實資料。**

## GitHub 版本

Pull Request：[#1 Martin Decision Center v2.1.0 – Page and Instagram Insights](https://github.com/wyghvtm56n-spec/paiwei-dashboard-v2/pull/1)

最新提交：`717e750 Add Page and Instagram video insights`

## 程式已完成的內容

本版本新增 `src/content.js`，分別讀取 Facebook Page 影片清單與影片洞察、Instagram Professional Account 的 Media 清單與逐筆 Insights。資料端點為受登入保護的 `/content/videos`，並已接入首頁的「粉專與 Instagram 影片」區塊。內容洞察與既有 Ads Insights 使用不同 Token，不會把自然內容互動與廣告成效混在同一個指標區。

粉專卡片首版顯示影片名稱、更新日期、永久連結、`total_video_views`、`total_video_views_unique`、Likes、Comments、Shares 與 Saved（API 有回傳時才顯示）。Instagram Feed／Reels 卡片首版顯示 Views、Reach、Likes、Comments、Shares、Saved、Total interactions；Reels 另顯示平均觀看時間、總觀看時間與前三秒跳過率。沒有資料時顯示 `N/A`，不補成 0。

## 你需要設定的最小項目

| 類型 | 名稱 | 用途 |
|---|---|---|
| Cloudflare Variable | `META_CONTENT_PAGE_ID` | Facebook 粉專 ID |
| Cloudflare Variable | `META_CONTENT_IG_USER_ID` | Instagram Professional Account ID；可先不填，程式會用 Page ID 查詢 |
| Cloudflare Secret | `META_CONTENT_PAGE_ACCESS_TOKEN` | 讀取粉專影片清單與 `/VIDEO_ID/video_insights` |
| Cloudflare Secret | `META_CONTENT_USER_ACCESS_TOKEN` | 取得連結 IG 帳號、列出 Media 與讀取 Media Insights |
| 可選 Variable | `META_CONTENT_GRAPH_VERSION` | 預設 `v26.0`，通常不需要覆寫 |

**請不要把任何 Token 貼在聊天或提交到 GitHub。** 你只需要將 Token 設為 Cloudflare Worker Secret；我不需要看到 Token 的完整內容。

## 最小必要權限

### Facebook 粉專影片

Page access token 必須由能對該粉專執行 `ANALYZE` task 的 Facebook 使用者取得，並包含 `pages_read_engagement`。若要列出粉專影片，官方 Get Videos 文件對可管理的 Page 另說明 `MANAGE` task 情境；若不是可管理的已發佈 Page，可能需要 Page Public Content Access。[1] [2]

### Instagram Professional Account

本專案採用 Instagram API with Facebook Login。Facebook User access token 需要 `instagram_basic`、`instagram_manage_insights`、`pages_read_engagement`。若該使用者是透過 Business Manager 取得連結 Page role，還需要 `ads_read` 或 `ads_management`。[3]

若不提供 `META_CONTENT_IG_USER_ID`，程式會呼叫 `GET /<PAGE_ID>?fields=instagram_business_account`；官方文件要求 `instagram_basic` 與 `pages_show_list`，Business Manager Page role 情境則還需要 `ads_read` 或 `ads_management`。[4]

## Cloudflare 設定範例

```bash
npx wrangler secret put META_CONTENT_PAGE_ACCESS_TOKEN
npx wrangler secret put META_CONTENT_USER_ACCESS_TOKEN

# Variables 可在 Cloudflare Dashboard 設定：
# META_CONTENT_PAGE_ID=你的粉專 ID
# META_CONTENT_IG_USER_ID=你的 Instagram Professional Account ID（可選）
```

設定後重新部署 Worker，再開啟 `/content/videos` 或首頁的「粉專與 Instagram 影片」區塊。若只設定一組 Token，另一個來源會顯示局部失敗，不會讓整個儀表板故障。

## 重要資料限制

Meta 官方文件指出，Instagram Media Insights 的資料計算可能延遲最多 48 小時；沒有可用資料時 API 會回傳空資料集，而不是 0。[3] Story 的洞察保存時間與其他 Media 不同，因此本版先排除 Story。Instagram 一般的 `views`、`likes`、`comments`、`shares` 等欄位主要反映自然互動；若要取得包含 promoted／boosted／ad media 的 total metrics，必須使用 Facebook Login 流程且該指標可用。[3]

Facebook Page Video Insights 使用 `/VIDEO_ID/video_insights`，官方範例包含 `total_video_views` 與 `total_video_views_unique`，並要求 `pages_read_engagement` 及具備 Page ANALYZE task 的 Page access token。[1]

## 驗證結果

`npm run verify` 已通過 **10／10 項測試**，包含 Token 未設定時不誤呼叫、粉專影片與 Instagram Reels Insights 正規化、既有決策引擎、登入 Cookie 與安全標頭。桌面與 390px 手機預覽亦已確認未設定 Token 時顯示清楚的設定引導，不會出現空白或假資料。

## 官方參考

[1]: https://developers.facebook.com/documentation/video-api/guides/insights "Meta：Get Insights using the Facebook Video API"
[2]: https://developers.facebook.com/documentation/video-api/guides/get-videos "Meta：Get Facebook Videos using the Facebook Video API"
[3]: https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights "Meta：Instagram Media Insights"
[4]: https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/page "Meta：Page — Getting a Page’s IG User"
