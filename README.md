# Martin Decision Center

Cloudflare Workers 營運決策儀表板，整合 LINE D1 統計、Meta Ads Insights、粉專／Instagram 內容洞察與三平台原始訊息中心。v2.5.0 在保留既有決策、LINE、內容與手機優化的前提下，恢復 Facebook Messenger、Instagram Direct 與 LINE 的原始對話、聯絡人資料與客服工作區欄位。

## v2.0.0 重點

首頁現在只回答三件事：**今天要做什麼、哪些訊號需要檢查、有哪些測試候選**。所有結論都會顯示依據，不再以沒有預約或成交資料的流量指標建議加碼或停投。趨勢比較只使用完整日期，廣告與區域候選也必須通過最低 Amount spent、Impressions 與 Clicks (all) 樣本門檻。

| 改善面向 | v2.0.0 作法 |
|---|---|
| 決策可信度 | 移除互相矛盾的分數，統一由 `src/decision.js` 產生摘要 |
| Meta 指標 | 使用 Amount spent、Impressions、Reach、Clicks (all)、CTR (all)、CPC (all)、Frequency |
| 區間彙總 | Reach 與 Frequency 使用 Meta 區間 aggregate，不把每日 Reach 相加 |
| 手機體驗 | 廣告與區域預設只顯示前三項，其餘收合；素材分類改為單欄卡片 |
| 穩定性 | Meta API 加入逾時、有限重試、五分鐘快取與局部降級 |
| 安全性 | 可選密碼登入、HttpOnly Cookie、安全標頭與受保護 JSON 路由 |
| 內容洞察 | 粉專影片與 Instagram Feed／Reels；逐媒體 Insights、延遲與局部失敗提示 |
| 訊息中心 | 三平台原始對話、聯絡人資料、客服工作區、需求訊號與官方後台入口；獨立管理密碼保護 |
| 測試 | 使用 Node 內建測試覆蓋完整日趨勢、樣本門檻、登入 Cookie、安全標頭與內容正規化 |

## 資料來源與限制

| 資料來源 | 目前內容 | 尚未包含 |
|---|---|---|
| LINE D1 | 訊息事件、匿名詢問帳號、新增好友、封鎖、圖片、按鈕與關鍵字分類 | 有效名單、預約、成交、營收 |
| Meta Ads Insights | 近七天帳戶摘要、每日趨勢、廣告、區域、年齡／性別、平台／版位 | 與自然內容的成交歸因 |
| Meta Content Insights | Facebook 粉專影片、Instagram Feed／Reels Media 與洞察；需要額外內容 Token | 預約、成交、營收歸因 |
| 規則式決策 | 完整日趨勢、樣本門檻、測試候選與資料缺口 | 自動修改預算、啟停廣告或真正模型分析 |

現有 LINE 關鍵字分類可能讓同一則訊息進入多個類別，因此不能直接當成有效名單。Meta Breakdown 也只適合建立測試假設，不應單獨用來判斷自動投放配置是否錯誤。

## 路由

| 路由 | 用途 |
|---|---|
| `/` | Martin Decision Center，含訊息中心摘要 |
| `/messages` | 管理密碼保護的三平台原始訊息、個資、客服欄位與唯讀對話紀錄 |
| `/login` | 可選的儀表板密碼登入 |
| `/logout` | 清除登入 Cookie |
| `/health` | 公開健康檢查，不包含商業資料 |
| `/api/dashboard` | 完整儀表板 JSON；若已啟用密碼則受保護 |
| `/meta/ads` | Meta 每日資料與區間摘要 JSON；受保護 |
| `/meta/breakdowns` | 區域、人口與版位 Breakdown JSON；受保護 |
| `/content/videos` | 粉專影片與 Instagram Media／Reels JSON；受保護 |
| `/api/messages` | 管理密碼保護的原始訊息 JSON；只讀 D1 `message_*` 表 |

## Cloudflare 設定

D1 Binding 名稱必須是 `DB`，並指向目前的 `paiwei-line-health-db`。Meta 廣告帳號 ID 使用 Worker Variable `meta_ad_account_id`，Meta 廣告權杖使用 Secret `META_ACCESS_TOKEN`。粉專／Instagram 內容使用分離的 Token 與 ID：`META_CONTENT_PAGE_ID`、`META_CONTENT_IG_USER_ID`、`META_CONTENT_PAGE_ACCESS_TOKEN`、`META_CONTENT_USER_ACCESS_TOKEN`。API 版本可用 `META_CONTENT_GRAPH_VERSION` 覆寫，預設為 `v26.0`。

建議同時設定以下兩個 Secret 以啟用主儀表板密碼保護；原始訊息中心會優先使用舊版已存在的 `MESSAGE_ADMIN_PASSWORD` 與 `MESSAGE_SESSION_SECRET`：

```text
DASHBOARD_PASSWORD
COOKIE_SIGNING_KEY
MESSAGE_ADMIN_PASSWORD
MESSAGE_SESSION_SECRET
```

主儀表板只有 `DASHBOARD_PASSWORD` 與 `COOKIE_SIGNING_KEY` 都存在時才會要求登入；訊息中心只有 `MESSAGE_ADMIN_PASSWORD` 與 `MESSAGE_SESSION_SECRET` 都存在時才會要求登入。實際密碼、簽章金鑰、Hash Salt 與訊息 Secrets 不得提交到 GitHub。

```bash
npx wrangler secret put META_ACCESS_TOKEN
npx wrangler secret put META_CONTENT_PAGE_ACCESS_TOKEN
npx wrangler secret put META_CONTENT_USER_ACCESS_TOKEN
npx wrangler secret put DASHBOARD_PASSWORD
npx wrangler secret put COOKIE_SIGNING_KEY
```

## 從 GitHub 執行部署

儲存庫現在包含兩個 GitHub Actions：`Verify Dashboard` 會在 push／Pull Request 執行 `npm run verify`；`Deploy Cloudflare Worker` 只接受手動 `workflow_dispatch`，並使用 `production` environment。

要讓 GitHub 能執行部署，需在 Repository Secrets 設定：

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

`CLOUDFLARE_API_TOKEN` 應只授予目標帳號的 Workers Scripts 編輯權限；`CLOUDFLARE_ACCOUNT_ID` 是 Cloudflare Account ID。粉專／Instagram 的 `META_CONTENT_*` Secrets 不需要複製到 GitHub，仍留在 Cloudflare Worker Secret 中，由部署後的 Worker 讀取。

## 本機檢查與部署

```bash
npm install
npm run verify
npm run dev
npm run deploy
```

`npm run verify` 會先執行所有 JavaScript 語法檢查，再執行 Node 測試。部署前應確認 Cloudflare Worker 的 D1 Binding、Variables 與 Secrets 均已設定。

## 原始碼結構

| 檔案 | 職責 |
|---|---|
| `src/line.js` | LINE D1 聚合查詢 |
| `src/meta.js` | Meta Ads API、指標正規化、逾時、重試與分頁完整性 |
| `src/content.js` | 粉專影片、Instagram Media／Reels 清單與逐媒體 Insights |
| `src/content-render.js` | 粉專／Instagram 內容卡片與資料延遲提示 |
| `src/message-center.js` | 三平台原始訊息頁、個資欄位、對話狀態與手機介面 |
| `src/message-data.js` | 從既有 D1 `message_*` 表批次讀取對話、訊息事件與客服工作區 |
| `src/decision.js` | 單一規則式決策摘要與樣本門檻 |
| `src/dashboard-data.js` | 平行載入、局部降級與五分鐘快取 |
| `src/auth.js` | 可選密碼登入與簽章 Cookie |
| `src/render.js` | 桌面與手機介面 |
| `src/worker.js` | 路由、安全標頭與回應格式 |
| `test/` | 決策與安全測試 |

## 粉專與 Instagram 影片串接

影片內容區已加入儀表板。Facebook 粉專影片需要 `META_CONTENT_PAGE_ID` 與 `META_CONTENT_PAGE_ACCESS_TOKEN`；Instagram Login 需要 `META_CONTENT_IG_USER_ID` 與 `META_IG_LOGIN_ACCESS_TOKEN`。訊息中心路由為 `/messages`，原始 Messenger／Instagram Direct／LINE 對話來自既有 D1 `message_*` 表；官方收件匣仍是回覆、標記已讀與平台操作的正式入口。新版 Instagram Login 會優先使用 `graph.instagram.com` 與 `instagram_business_basic`／`instagram_business_manage_insights`。若未設定 Instagram Login Secret，系統才回退到 `META_CONTENT_USER_ACCESS_TOKEN` 或既有的 `INSTAGRAM_ACCESS_TOKEN` Facebook Login 路徑。內容 Token 與現有 `META_ACCESS_TOKEN` 分離，避免自然內容權限與廣告權限混用。

粉專影片首版使用 `/<PAGE_ID>/videos` 與 `/<VIDEO_ID>/video_insights`；若 Meta 拒絕影片 Insights，系統會保留影片清單，並嘗試顯示 API 可回傳的影片欄位，卡片會標示「可見觀看次數」或「完整洞察尚未提供」，不把缺少的流量補成 0。Instagram Login 使用 `/<IG_USER_ID>/media` 與 `/<INSTAGRAM_MEDIA_ID>/insights`，可讀取 Views、Reach、Likes、Comments、Shares、Saved、Total interactions，以及 Reels 平均觀看時間、總觀看時間與前三秒跳過率。Instagram Insights 可能延遲最多 48 小時，缺少資料時顯示 N/A。內容洞察會獨立於廣告區塊，不直接當成成交或營收結果。
