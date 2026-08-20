# Instagram API with Instagram Login 研究結果

## 官方規格

Meta 官方文件確認，Instagram API with Instagram Login 支援 Instagram 專業帳號（Business／Creator）的媒體讀取與 Media Insights，不要求 Facebook Page 與 Instagram 帳號連結。新版權限名稱包含 `instagram_business_basic` 與 `instagram_business_manage_insights`；Instagram Login 的 host 是 `graph.instagram.com`，Facebook Login 的 host 才是 `graph.facebook.com`。

Instagram Media Insights 使用 `GET /<INSTAGRAM_MEDIA_ID>/insights`，API version v26.0。Instagram Login 可使用 `views`、`reach`、`likes`、`comments`、`saved`、`shares`、`total_interactions`，Reels 另可使用 `ig_reels_avg_watch_time`、`ig_reels_video_view_total_time`、`reels_skip_rate` 等。資料可能延遲最多 48 小時，缺少資料時回傳空資料集而非 0。

Instagram Media 讀取使用 `GET /<INSTAGRAM_USER_ID>/media`，同樣使用 `graph.instagram.com` 與 Instagram User access token。媒體欄位可包含 `id`、`caption`、`media_type`、`media_product_type`、`media_url`、`permalink`、`thumbnail_url`、`timestamp`，以及部分公開欄位如 `view_count`、`like_count`、`comments_count`。

## 來源

1. [Instagram API with Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login)
2. [Insights](https://developers.facebook.com/documentation/instagram-platform/insights)
3. [Instagram Media Insights](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights)
4. [IG Media](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media)

## 實作決策

保留現有 Facebook Login／`graph.facebook.com` 路徑作為相容方案，但新增 Instagram Login 路徑：以 `META_IG_LOGIN_ACCESS_TOKEN` Secret 與 `META_CONTENT_IG_USER_ID` Variable 呼叫 `graph.instagram.com`。若新版 Token 可用，優先使用 Instagram Login；若未設定，才回退到既有 Facebook Login 路徑。所有 Token 值只留在 Cloudflare Secrets，不進 GitHub 或回應內容。
