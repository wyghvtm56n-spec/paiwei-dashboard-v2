# Martin Decision Center

Cloudflare Workers 營運決策儀表板，整合 LINE D1 統計與 Meta Ads Insights。v2.0.0 將舊版的多套「AI 分數」改為**單一、可測試的規則式決策摘要**，並針對桌面與手機重新設計資訊架構。

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
| 測試 | 使用 Node 內建測試覆蓋完整日趨勢、樣本門檻、登入 Cookie 與安全標頭 |

## 資料來源與限制

| 資料來源 | 目前內容 | 尚未包含 |
|---|---|---|
| LINE D1 | 訊息事件、匿名詢問帳號、新增好友、封鎖、圖片、按鈕與關鍵字分類 | 有效名單、預約、成交、營收 |
| Meta Ads Insights | 近七天帳戶摘要、每日趨勢、廣告、區域、年齡／性別、平台／版位 | 粉專影片、Instagram Reels／貼文洞察 |
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

## Cloudflare 設定

D1 Binding 名稱必須是 `DB`，並指向目前的 `paiwei-line-health-db`。Meta 廣告帳號 ID 使用 Worker Variable `meta_ad_account_id`，Meta 權杖使用 Secret `META_ACCESS_TOKEN`。

建議同時設定以下兩個 Secret 以啟用密碼保護：

```text
DASHBOARD_PASSWORD
COOKIE_SIGNING_KEY
```

只有兩者都存在時才會要求登入；若未設定，系統會維持舊版直接開啟的行為，方便先測試再啟用保護。實際密碼與簽章金鑰不得提交到 GitHub。

```bash
npx wrangler secret put META_ACCESS_TOKEN
npx wrangler secret put DASHBOARD_PASSWORD
npx wrangler secret put COOKIE_SIGNING_KEY
```

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
| `src/meta.js` | Meta API、指標正規化、逾時、重試與分頁完整性 |
| `src/decision.js` | 單一規則式決策摘要與樣本門檻 |
| `src/dashboard-data.js` | 平行載入、局部降級與五分鐘快取 |
| `src/auth.js` | 可選密碼登入與簽章 Cookie |
| `src/render.js` | 桌面與手機介面 |
| `src/worker.js` | 路由、安全標頭與回應格式 |
| `test/` | 決策與安全測試 |

## 下一階段

粉專與 Instagram 影片數據可以再透過 Meta Graph API 接入，但需要 Page access token、Instagram 專業帳號及相應洞察權限。接入前應先確認要追蹤的商業目標與內容指標，並與廣告成效分開呈現，避免把自然內容互動與廣告歸因混在一起。
