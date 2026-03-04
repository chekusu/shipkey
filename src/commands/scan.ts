import { Command } from "commander";
import { resolve, join, relative } from "path";
import { writeFile } from "fs/promises";
import { createInterface } from "readline";
import { walkAndScan, printScanSummary } from "../scanner/project";
import { loadConfig } from "../config";

async function promptBackend(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      "\n  Select a backend:\n    1) 1Password (default)\n    2) Bitwarden\n  Choice [1]: ",
      (answer) => {
        rl.close();
        resolve(answer.trim());
      }
    );
  });
}

export const scanCommand = new Command("scan")
  .description("Scan project and generate shipkey.json in each directory with .env files")
  .option("--dry-run", "print results without writing shipkey.json")
  .argument("[dir]", "project directory", ".")
  .action(async (dir: string, opts: { dryRun?: boolean }) => {
    const projectRoot = resolve(dir);
    console.log(`Scanning ${projectRoot}...\n`);

    const found = await walkAndScan(projectRoot);

    if (found.length === 0) {
      console.log("  No .env files found.");
      return;
    }

    // Pre-load existing configs to know which dirs already have a backend set
    const existingBackends = new Map<string, string | undefined>();
    for (const { dir: d } of found) {
      try {
        const existing = await loadConfig(d);
        existingBackends.set(d, existing.backend);
      } catch {
        existingBackends.set(d, undefined);
      }
    }

    // Prompt once if any directory doesn't have a backend configured yet
    let chosenBackend: string | undefined;
    const anyNeedsBackend = [...existingBackends.values()].some((b) => !b);
    if (anyNeedsBackend && !opts.dryRun) {
      const choice = await promptBackend();
      chosenBackend = choice === "2" ? "bitwarden" : "1password";
    }

    for (const { dir: d, result } of found) {
      const relDir = relative(projectRoot, d) || ".";
      console.log(`\n  [${relDir}]`);
      printScanSummary(result);

      if (!opts.dryRun) {
        result.config.backend = existingBackends.get(d) ?? chosenBackend ?? "1password";

        const outPath = join(d, "shipkey.json");
        await writeFile(outPath, JSON.stringify(result.config, null, 2) + "\n");
        console.log(`  ✓ Written ${relative(projectRoot, outPath) || "shipkey.json"}`);
      }
    }

    if (opts.dryRun) {
      console.log(`\n  (dry-run: no shipkey.json files written)`);
    } else {
      console.log(`\n  Done. ${found.length} shipkey.json file(s) written.`);
    }
  });
