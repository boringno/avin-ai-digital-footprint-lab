import fs from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8")) as { scripts: Record<string, string> };
const workflow = fs.readFileSync(path.resolve(appRoot, "../.github/workflows/line-ai-live-demo-ci.yml"), "utf8");
const defined = Object.keys(packageJson.scripts).filter((name) => name.startsWith("validate:")).sort();
const called = [...workflow.matchAll(/npm run (validate:[\w-]+)/g)].map((match) => match[1]).sort();
const missing = defined.filter((name) => !called.includes(name));
const unknown = called.filter((name) => !defined.includes(name));
const duplicates = called.filter((name, index) => called.indexOf(name) !== index);

if (missing.length || unknown.length || duplicates.length) {
  throw new Error(`CI validator parity failed: missing=${missing.join(",")} unknown=${unknown.join(",")} duplicates=${duplicates.join(",")}`);
}
console.log(`CI validator parity passed: ${defined.length} validators`);
