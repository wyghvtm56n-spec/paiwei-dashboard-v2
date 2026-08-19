import assert from "node:assert/strict";
import test from "node:test";

import { buildDecisionSnapshot } from "../src/decision.js";

function makeDaily(date_start, ctrAll, cpcAll) {
  return { date_start, ctrAll, cpcAll };
}

function baseData(overrides = {}) {
  return {
    line: { messages24h: 4, users7d: 12 },
    meta: {
      summary: {
        amountSpent: 3_000,
        impressions: 100_000,
        reach: 70_000,
        clicksAll: 3_000,
        ctrAll: 3,
        cpcAll: 1,
        frequency: 1.43,
      },
      daily: [
        makeDaily("2026-08-13", 4.0, 1.0),
        makeDaily("2026-08-14", 4.0, 1.0),
        makeDaily("2026-08-15", 4.0, 1.0),
        makeDaily("2026-08-16", 3.0, 1.2),
        makeDaily("2026-08-17", 3.0, 1.2),
        makeDaily("2026-08-18", 3.0, 1.2),
        makeDaily("2026-08-19", 0.1, 9.0),
      ],
    },
    ads: {
      data: [
        {
          adName: "案例素材 A",
          amountSpent: 800,
          impressions: 20_000,
          clicksAll: 800,
          ctrAll: 4,
          cpcAll: 1,
        },
      ],
    },
    breakdowns: {
      regions: {
        data: [
          {
            region: "Taipei City",
            amountSpent: 600,
            impressions: 18_000,
            clicksAll: 700,
            ctrAll: 3.89,
            cpcAll: 0.86,
          },
        ],
      },
    },
    ...overrides,
  };
}

test("忽略指定今日的未完成資料，使用前六個完整日比較", () => {
  const decision = buildDecisionSnapshot(baseData(), {
    todayKey: "2026-08-19",
  });

  assert.equal(decision.trend.ready, true);
  assert.deepEqual(decision.trend.recentPeriod, [
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
  ]);
  assert.ok(decision.trend.ctrAllChange < 0);
  assert.ok(decision.trend.cpcAllChange > 0);
});

test("決策摘要不輸出加碼或停投指令", () => {
  const decision = buildDecisionSnapshot(baseData(), {
    todayKey: "2026-08-19",
  });
  const actionableOutput = JSON.stringify({
    summaryText: decision.summaryText,
    actions: decision.actions,
    opportunities: decision.opportunities,
  });

  assert.equal(actionableOutput.includes("加碼"), false);
  assert.equal(actionableOutput.includes("停投"), false);
  assert.equal(decision.mode, "rules_v2");
});

test("小樣本廣告不會成為測試候選", () => {
  const data = baseData();
  data.ads.data[0] = {
    adName: "樣本過小",
    amountSpent: 80,
    impressions: 900,
    clicksAll: 12,
    ctrAll: 8,
    cpcAll: 0.2,
  };

  const decision = buildDecisionSnapshot(data, {
    todayKey: "2026-08-19",
  });

  assert.equal(
    decision.opportunities.some((item) => item.type === "ad_test_candidate"),
    false,
  );
});

test("缺少完整日期時標示資料不足", () => {
  const data = baseData();
  data.meta.daily = data.meta.daily.slice(0, 4);

  const decision = buildDecisionSnapshot(data, {
    todayKey: "2026-08-19",
  });

  assert.equal(decision.trend.ready, false);
  assert.equal(decision.status, "資料不足");
});
