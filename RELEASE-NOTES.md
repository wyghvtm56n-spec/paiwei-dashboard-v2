# Paiwei AI Center v1.2.0

## 本版修改
- 刪除重複的第二個「Meta 廣告排行榜（近 7 天）」區塊。
- 保留原本第一個含 AI 建議的廣告排行榜。
- 保留 AI 廣告健康度、AI 素材類型分析、Meta 趨勢圖與 LINE 統計。
- 專案版本更新為 1.2.0。

## 部署方式
1. 解壓縮本 ZIP。
2. 將全部內容覆蓋到 GitHub Desktop 的本機專案資料夾。
3. Commit：`Release Paiwei AI Center v1.2.0`
4. Push origin，等待 Cloudflare 自動部署。

## Cloudflare 必要設定
- D1 Binding：`DB`
- Secret：`META_ACCESS_TOKEN`
- Variable：`meta_ad_account_id`
