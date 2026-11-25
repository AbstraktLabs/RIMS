// Runs every *.test.mjs suite in this folder, one after another, against E2E_BASE_URL.
// Usage: pnpm test:e2e            (all suites)
//        pnpm test:e2e core       (suites whose file name contains "core")
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2];
const files = readdirSync(here)
  .filter((f) => f.endsWith(".test.mjs") && (!filter || f.includes(filter)))
  .sort();

const results = files.map((f) => ({ f, code: spawnSync(process.execPath, [join(here, f)], { stdio: "inherit" }).status }));
console.log("\n──────── summary ────────");
for (const r of results) console.log(`${r.code === 0 ? "PASS" : "FAIL"}  ${r.f}`);
process.exit(results.every((r) => r.code === 0) ? 0 : 1);
