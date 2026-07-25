# Paiwei Dashboard v2

派威 LINE 與 Meta Ads 營運 Dashboard。

## 專案結構

```text
src/
├── worker.js   路由與資料整合
├── line.js     LINE / D1 統計
├── meta.js     Meta Ads API
└── render.js   Dashboard 畫面與 Chart.js
```

## Cloudflare 必要設定

### D1 Binding

Binding 名稱：

```text
DB
```

請把 `wrangler.toml` 中的 D1 名稱與 ID 換成目前使用中的值。

### Variables and Secrets

Variable：

```text
meta_ad_account_id
```

Secret：

```text
META_ACCESS_TOKEN
```

請勿把 Meta Access Token 寫進 GitHub。

## 部署

```bash
npm install
npm run deploy
```

## 路由

Dashboard：

```text
/
```

Meta 每日 JSON：

```text
/meta/ads
```
