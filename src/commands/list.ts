import { Command } from "commander";
import { getBackend } from "../backends";
import { loadConfig } from "../config";
import { walkDirsWithShipkey } from "../scanner";
import { resolve, relative } from "path";

export const listCommand = new Command("list")
  .description("List keys stored in your password manager")
  .option("-e, --env <env>", "filter by environment")
  .option("--all", "list all projects", false)
  .option("--project <name>", "project name")
  .argument("[dir]", "project directory", ".")
  .action(async (dir: string, opts) => {
    const projectRoot = resolve(dir);
    const env = opts.env;

    const shipkeyDirs = await walkDirsWithShipkey(projectRoot);

    if (shipkeyDirs.length === 0) {
      console.error("  No shipkey.json found. Run `shipkey scan` first.");
      process.exit(1);
    }

    for (const d of shipkeyDirs) {
      const relDir = relative(projectRoot, d) || ".";

      let config;
      try {
        config = await loadConfig(d);
      } catch {
        continue;
      }

      const project = opts.all ? undefined : (opts.project || config.project);
      const backend = getBackend(config.backend);

      if (!(await backend.isAvailable())) {
        console.error(
          `  [${relDir}] ${backend.name} CLI not available.`
        );
        continue;
      }

      const refs = await backend.list(project, env);

      if (refs.length === 0) continue;

      console.log(`\n  [${relDir}]`);

      // Group by provider
      const grouped = new Map<string, typeof refs>();
      for (const ref of refs) {
        const key = `${ref.provider} (${ref.project}.${ref.env})`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(ref);
      }

      console.log(`  ${refs.length} keys:`);
      for (const [group, items] of grouped) {
        console.log(`    ${group}`);
        for (const item of items) {
          console.log(`      · ${item.field}`);
        }
      }
    }
  });
