# Paiwei AI Center

Cloudflare Workers Dashboard，整合 LINE D1 統計與 Meta Ads Insights。

## 目前功能

- LINE 訊息、人數、好友、封鎖、圖片、Postback 統計
- Meta 近 7 天花費、曝光、觸及、點擊、CTR、CPC、頻率
- 個別廣告排行榜與素材類型分析
- Meta 縣市、年齡／性別、平台／版位 Breakdown
- AI 廣告健康度與唯讀建議

## 路由

- `/`：營運 Dashboard
- `/meta/ads`：Meta 每日資料 JSON
- `/meta/breakdowns`：Meta 區域、人口、版位 Breakdown JSON

## Cloudflare Bindings

- D1：`DB`
- Variable：`meta_ad_account_id`
- Secret：`META_ACCESS_TOKEN`

## 指令

```bash
npm install
npm run check
npm run dev
npm run deploy
```
