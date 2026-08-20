# Martin Decision Center v2.3.0

## Instagram Login API update

Instagram content integration now supports the official Instagram API with Instagram Login. It uses `META_IG_LOGIN_ACCESS_TOKEN`, `META_CONTENT_IG_USER_ID`, `graph.instagram.com`, and the `instagram_business_basic`／`instagram_business_manage_insights` permissions. The previous Facebook Login path remains available as a fallback. Reels metrics include views, reach, likes, comments, shares, saved, total interactions, average watch time, total watch time, and skip rate when Meta returns them; Insights can be delayed by up to 48 hours.

## 決策可信度

v2.0.0 移除舊版互相矛盾的 AI 戰情室分數與廣告健康分數，改為單一規則式決策摘要。系統現在只顯示今日三件事、需要檢查的訊號與測試候選，並明確列出資料證據、樣本門檻與缺少預約／成交／營收的限制。沒有成交資料時，不再輸出加碼或停投指令。

## 指標與資料品質

Meta 指標改用精確名稱 Amount spent、Impressions、Reach、Clicks (all)、CTR (all)、CPC (all) 與 Frequency。Reach 與 Frequency 取自 Meta 區間 aggregate；若 aggregate 無法取得，介面顯示 N/A，不會把每日 Reach 相加。趨勢比較只使用最近三個完整日與前面三個完整日，避免今天未結束資料造成誤判。

Meta API 已升級為 v26.0，並加入八秒逾時、針對 429／5xx 的有限重試、Bearer Authorization header、分頁完整性狀態與五分鐘快取。LINE、Meta 摘要、廣告或 Breakdown 任一來源失敗時，其餘區塊仍可顯示。

## 介面

首頁重新設計為 Martin Decision Center。桌面首屏可直接看到決策摘要、三項工作、異常與測試機會；手機版廣告與區域只預設顯示前三項，其餘收合。素材分類改為單欄卡片，Amount spent 與效率趨勢分成兩張圖，平台／版位名稱也改為一般經營者可理解的文字。

## 粉專與 Instagram 影片洞察

新增獨立的內容資料層與 `/content/videos` 路由。Facebook 粉專使用 Page access token 讀取 `/PAGE_ID/videos` 與 `/VIDEO_ID/video_insights`；Instagram 使用 Facebook User access token 讀取連結的 Professional Account Media 與 `/INSTAGRAM_MEDIA_ID/insights`。內容 Token 與現有 Ads Token 分離，避免自然內容互動與廣告投放指標混用。

儀表板新增粉專影片與 Instagram Feed／Reels 卡片，顯示 views、reach、likes、comments、shares、saved、total_interactions；Reels 另顯示平均觀看時間、總觀看時間與前三秒跳過率。若 Meta 拒絕完整影片 Insights，系統仍保留粉專影片清單，並嘗試讀取 API 可回傳的影片欄位；卡片會標示「可見觀看次數」或「完整洞察尚未提供」，不把缺少資料補成 0。Instagram 洞察可能延遲最多 48 小時，首版排除 Story。

## 安全與測試

新增可選的 `DASHBOARD_PASSWORD` 與 `COOKIE_SIGNING_KEY` Cloudflare Secrets。設定後，首頁與商業資料 JSON 路由會要求密碼登入，登入 Cookie 使用 HttpOnly、Secure 與 SameSite=Lax。Worker 同時加入 Content Security Policy、禁止 iframe、no-referrer 與權限限制標頭。

新增十一項自動化測試，涵蓋完整日趨勢、樣本門檻、不輸出加碼／停投指令、向下相容、登入 Cookie、錯誤密碼、安全標頭、粉專／Instagram 影片資料正規化，以及 Insights 權限不足時的粉專影片欄位回退。

---

# Paiwei AI Center v1.4.0

## 本次更新

- 手機版區域、年齡／性別、平台／版位與廣告排行榜改為卡片式顯示，不再被右側裁切。
- 年齡／性別補上觸及與平均頻率。
- 平台／版位補上觸及與平均頻率。
- 長廣告名稱、活動名稱及版位名稱可自動換行。
- 保留桌面版完整表格與橫向比較。
- 仍為唯讀版本，不會修改 Meta 廣告。

# Paiwei AI Center v1.3.0

## 本次新增

- Meta 縣市／區域成效分析
- Meta 年齡＋性別分析
- Meta 平台＋版位分析
- 平均頻率指標，用來初步觀察素材疲勞
- 區域「加碼候選／持續觀察／成本偏高／資料仍少」判斷
- `/meta/breakdowns` 診斷資料端點，方便檢查 Meta Breakdown 回傳結果
- 個別廣告完整分頁讀取，避免只顯示第一頁
- 廣告排行榜預設顯示前 10 支，其餘可展開

## 安全範圍

- 本版本仍為唯讀，不會修改 Meta 廣告設定。
- 區域建議目前只依花費、點擊、CTR、CPC 判斷，尚未連結 LINE 詢問與成交資料。
- 若某一種 Breakdown 不被目前廣告資料或 Meta API 支援，Dashboard 會顯示該區塊錯誤，不會讓整頁故障。
