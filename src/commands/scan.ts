import { Command } from "commander";
import { resolve, join } from "path";
import { writeFile } from "fs/promises";
import { scanProject, printScanSummary } from "../scanner/project";

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
      const outPath = join(projectRoot, "shipkey.json");
      await writeFile(outPath, JSON.stringify(result.config, null, 2) + "\n");
      console.log(`\n  ✓ Written shipkey.json`);
    } else {
      console.log(`\n  (dry-run: shipkey.json not written)`);
    }
  });
