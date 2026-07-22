import { strict as assert } from "node:assert";

import { resolvePublishedScheduleForValidation } from "../src/lib/doctor-schedule";
import { hasAllScheduleBranches } from "../src/lib/schedule-month";

const branches = ["高雄館", "台中館", "桃園館", "林口館"] as const;
const assets = branches.map((branch) => ({
  branch,
  original_content_url: `https://example.com/${encodeURIComponent(branch)}.jpg`,
  preview_image_url: `https://example.com/${encodeURIComponent(branch)}-preview.jpg`,
}));
const historicalRows = [{ branch: "高雄館", doctor_name: "陳醫師", schedule_date: "2026-07-18", status: "available", time_slot: "13:00-18:00" }];

type ScheduleRow = {
  branch: string;
  doctor_name: string;
  schedule_date: string;
  status: string;
  time_slot: string;
};

function decision(message: string, published: boolean, rows: ScheduleRow[] = []) {
  return resolvePublishedScheduleForValidation({ assets, message, published, rows, sourceMonth: "2026-07" });
}

assert.equal(new Set(assets.map((asset) => asset.branch)).size, 4, "四館圖片資料完整");
assert.equal(hasAllScheduleBranches(branches), true, "四館圖片可發布");
assert.equal(hasAllScheduleBranches(branches.slice(0, 3)), false, "三館圖片不可發布");
assert.equal(hasAllScheduleBranches(branches.slice(0, 2)), false, "兩館圖片不可發布");
assert.equal(hasAllScheduleBranches(branches.slice(0, 1)), false, "單館圖片不可發布");
assert.equal(decision("高雄館門診表", true).replyMessages?.[0]?.type, "image", "已發布館別班表傳送圖片");
assert.equal(decision("高雄館門診表", false).replyMessages?.length ?? 0, 0, "未發布班表不傳圖片");
assert.equal(decision("陳醫師哪天看診", true).replyMessages?.length ?? 0, 0, "指定醫師查詢不傳圖片");
assert.match(decision("陳醫師哪天看診", true).matchedKey, /^doctor_schedule_branch_required:/, "指定醫師查詢未指定館別時先反問");
assert.match(decision("請給我班表", true).matchedKey, /^doctor_schedule_branch_required:/, "未指定館別先反問");
assert.match(decision("陳醫師哪天看診", true, historicalRows).matchedKey, /^doctor_schedule_found:/, "既有結構化資料仍可精確回覆");

console.log("schedule month validation passed: 11 checks");
