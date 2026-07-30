import { redactQuestionForAnalytics } from "../src/lib/security-redaction";

const source = [
  "\u6211\u53eb\u738b\u5c0f\u660e\uff0c\u738b\u5c0f\u59d0\u60a8\u597d\u3002\u96fb\u8a71 0912-345-678\uff0c\u5e02\u8a71 02-1234-5678\uff0cLINE ID: chen0912tw\uff0c\u5361\u865f 3782-822463-10005\uff0c\u4fe1\u7bb1 test@example.com",
  "\u6211\u52a0\u4f60 chen0912tw \u9019\u500b\u53ef\u4ee5\u55ce",
  "\u6211\u7684id\u662f chen0912tw",
  "\u6211LINE\u662f chen0912tw",
].join("\n");
const redacted = redactQuestionForAnalytics(source);
const blockedValues = [
  "\u738b\u5c0f\u660e",
  "\u738b\u5c0f\u59d0",
  "0912",
  "02-1234",
  "chen0912tw",
  "3782",
  "test@example.com",
];

const retained = blockedValues.filter((value) => redacted.includes(value));
if (retained.length > 0) {
  console.error(`FAIL analytics privacy: retained ${retained.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("PASS analytics privacy redaction");
}
