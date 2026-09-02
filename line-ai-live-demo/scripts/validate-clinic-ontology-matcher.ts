import { matchClinicOntology } from "@/lib/clinic-ontology-matcher";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const onda = matchClinicOntology("想了解 ONDA Pro");
assert(onda.treatments.length === 1 && onda.treatments[0].key === "onda_pro", "nested ONDA aliases must deduplicate");
assert(onda.fastPathEligible, "one explicit treatment must remain eligible for the fast path");

const negatedBotox = matchClinicOntology("我不想打肉毒");
assert(negatedBotox.negated && !negatedBotox.fastPathEligible, "negated treatment requests must abstain");

const negatedOnda = matchClinicOntology("我不是想問 ONDA");
assert(negatedOnda.negated && !negatedOnda.fastPathEligible, "不是想問 must abstain instead of selecting ONDA");

const noEntity = matchClinicOntology("今天天氣如何");
assert(!noEntity.fastPathEligible, "messages without ontology entities must not enter the fast path");

const multipleConcerns = matchClinicOntology("肚子跟雙下巴都想改善");
assert(multipleConcerns.concerns.length === 2, "all concerns must be collected instead of first-match wins");
assert(!multipleConcerns.fastPathEligible, "multiple concerns must abstain");

const multipleAreas = matchClinicOntology("手臂跟肚子");
assert(multipleAreas.concerns.length === 1 && multipleAreas.concerns[0].key === "local_contour", "related body areas share one concern");
assert(multipleAreas.areas.length === 2 && !multipleAreas.fastPathEligible, "multiple areas still require NLU or clarification");

const colloquialAbdomen = matchClinicOntology("小肚肚");
assert(colloquialAbdomen.areas[0]?.key === "abdomen", "colloquial abdomen term must use the canonical area ontology");
assert(colloquialAbdomen.concerns[0]?.key === "local_contour", "a uniquely mapped area may infer its canonical concern");

const colloquialArm = matchClinicOntology("掰掰肉");
assert(colloquialArm.areas[0]?.key === "arm", "colloquial arm term must use the canonical area ontology");
assert(colloquialArm.concerns[0]?.key === "local_contour", "arm must infer local contour without duplicating keywords");

for (const [message, expectedKey] of [
  ["貝恩希多少錢", "bei_en_xi_brand"],
  ["韓妍玻尿酸有活動嗎", "bei_en_xi_brand"],
  ["緹奧希1號多少錢", "teosyal_1_3_brand"],
  ["十蓓眼周多少錢", "tenthermage_eye_tip"],
  ["十蓓電波眼周多少錢", "tenthermage_eye_tip"],
  ["十倍電波眼周多少錢", "tenthermage_eye_tip"],
  ["眼周300發多少錢", "tenthermage_eye_tip"],
  ["奇蹟肉毒適合打哪裡", "botox"],
] as const) {
  const result = matchClinicOntology(message);
  assert(
    result.treatments[0]?.key === expectedKey,
    `approved direct alias must resolve ${message} to ${expectedKey}`,
  );
}

console.log("clinic ontology matcher validation passed");
