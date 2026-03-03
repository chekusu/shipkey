import { Command } from "commander";
import { resolve, join } from "path";
import { writeFile } from "fs/promises";
import { createInterface } from "readline";
import { scanProject, printScanSummary } from "../scanner/project";
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
  .description("Scan project and generate shipkey.json")
  .option("--dry-run", "print results without writing shipkey.json")
  .argument("[dir]", "project directory", ".")
  .action(async (dir: string, opts: { dryRun?: boolean }) => {
    const projectRoot = resolve(dir);
    console.log(`Scanning ${projectRoot}...\n`);

    const result = await scanProject(projectRoot);
    printScanSummary(result);

    if (!opts.dryRun) {
      // Preserve backend from existing config, or prompt if not yet set
      let backend: string | undefined;
      try {
        const existing = await loadConfig(projectRoot);
        backend = existing.backend;
      } catch {
        // No existing config
      }

      if (!backend) {
        const choice = await promptBackend();
        backend = choice === "2" ? "bitwarden" : "1password";
      }

      result.config.backend = backend;

      const outPath = join(projectRoot, "shipkey.json");
      await writeFile(outPath, JSON.stringify(result.config, null, 2) + "\n");
      console.log(`\n  ✓ Written shipkey.json`);
    } else {
      console.log(`\n  (dry-run: shipkey.json not written)`);
    }
  });
