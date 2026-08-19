# Martin Decision Center

Cloudflare Workers 營運決策儀表板，整合 LINE D1 統計、Meta Ads Insights 與粉專／Instagram 內容洞察。v2.1.0 延續 v2.0.0 的決策可信度改善，並加入**單一、可測試的規則式決策摘要**，並針對桌面與手機重新設計資訊架構。

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
| `/` | Martin Decision Center |
| `/login` | 可選的儀表板密碼登入 |
| `/logout` | 清除登入 Cookie |
| `/health` | 公開健康檢查，不包含商業資料 |
| `/api/dashboard` | 完整儀表板 JSON；若已啟用密碼則受保護 |
| `/meta/ads` | Meta 每日資料與區間摘要 JSON；受保護 |
| `/meta/breakdowns` | 區域、人口與版位 Breakdown JSON；受保護 |
| `/content/videos` | 粉專影片與 Instagram Media／Reels JSON；受保護 |

## Cloudflare 設定

D1 Binding 名稱必須是 `DB`，並指向目前的 `paiwei-line-health-db`。Meta 廣告帳號 ID 使用 Worker Variable `meta_ad_account_id`，Meta 廣告權杖使用 Secret `META_ACCESS_TOKEN`。粉專／Instagram 內容使用分離的 Token 與 ID：`META_CONTENT_PAGE_ID`、`META_CONTENT_IG_USER_ID`、`META_CONTENT_PAGE_ACCESS_TOKEN`、`META_CONTENT_USER_ACCESS_TOKEN`。API 版本可用 `META_CONTENT_GRAPH_VERSION` 覆寫，預設為 `v26.0`。

建議同時設定以下兩個 Secret 以啟用密碼保護：

```text
DASHBOARD_PASSWORD
COOKIE_SIGNING_KEY
```

只有兩者都存在時才會要求登入；若未設定，系統會維持舊版直接開啟的行為，方便先測試再啟用保護。實際密碼與簽章金鑰不得提交到 GitHub。

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
| `src/decision.js` | 單一規則式決策摘要與樣本門檻 |
| `src/dashboard-data.js` | 平行載入、局部降級與五分鐘快取 |
| `src/auth.js` | 可選密碼登入與簽章 Cookie |
| `src/render.js` | 桌面與手機介面 |
| `src/worker.js` | 路由、安全標頭與回應格式 |
| `test/` | 決策與安全測試 |

## 粉專與 Instagram 影片串接

影片內容區已加入儀表板，但要顯示真實資料，請設定 `META_CONTENT_PAGE_ID`、`META_CONTENT_PAGE_ACCESS_TOKEN` 與 `META_CONTENT_USER_ACCESS_TOKEN`。`META_CONTENT_IG_USER_ID` 可選；若留空，系統會使用 Page ID 與 Facebook User access token 查詢 `instagram_business_account`。內容 Token 與現有 `META_ACCESS_TOKEN` 分離，避免自然內容權限與廣告權限混用。

粉專影片首版使用 `/<PAGE_ID>/videos` 與 `/<VIDEO_ID>/video_insights`；Instagram 首版使用 `/<IG_USER_ID>/media` 與 `/<INSTAGRAM_MEDIA_ID>/insights`，先排除 Story。Instagram Insights 可能延遲最多 48 小時，缺少資料時顯示 N/A，不補成 0。內容洞察會獨立於廣告區塊，不直接當成成交或營收結果。
