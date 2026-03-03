import { Command } from "commander";
import { scan } from "../scanner";
import { walkDirsWithShipkey } from "../scanner";
import { getBackend } from "../backends";
import { guessProvider } from "../providers";
import { loadConfig } from "../config";
import { resolve, relative } from "path";

export const pushCommand = new Command("push")
  .description("Push env values from local files to your password manager")
  .option("-e, --env <env>", "environment (dev/prod)", "dev")
  .option("--vault <vault>", "Vault or folder name", "shipkey")
  .argument("[dir]", "project directory", ".")
  .action(async (dir: string, opts) => {
    const projectRoot = resolve(dir);
    const env = opts.env;
    const vault = opts.vault;

    const shipkeyDirs = await walkDirsWithShipkey(projectRoot);

    if (shipkeyDirs.length === 0) {
      console.error(
        "  No shipkey.json found. Run `shipkey scan` first."
      );
      process.exit(1);
    }

    for (const d of shipkeyDirs) {
      const relDir = relative(projectRoot, d) || ".";
      console.log(`\n  [${relDir}]`);

      let config;
      try {
        config = await loadConfig(d);
      } catch {
        console.error(`  ✗ Could not read shipkey.json in ${relDir}`);
        continue;
      }

      const backend = getBackend(config.backend);
      if (!(await backend.isAvailable())) {
        console.error(
          `  ✗ ${backend.name} CLI not available. Run 'shipkey setup' for installation instructions.`
        );
        continue;
      }

      const result = await scan(d);
      const entries = result.groups.flatMap((g) =>
        g.files
          .filter((f) => !f.isTemplate)
          .flatMap((f) =>
            f.vars
              .filter((v) => v.value && v.value.length > 0)
              .map((v) => ({
                key: v.key,
                value: v.value!,
                provider: guessProvider(v.key),
              }))
          )
      );

      if (entries.length === 0) {
        console.log("  No env values found to push. Only template files?");
        continue;
      }

      console.log(`  Pushing ${entries.length} keys to ${backend.name}...`);

      for (const entry of entries) {
        try {
          await backend.write({
            ref: {
              vault,
              provider: entry.provider,
              project: config.project,
              env,
              field: entry.key,
            },
            value: entry.value,
          });
          console.log(`  ✓ ${entry.key} → ${backend.name}`);
        } catch (err) {
          console.error(
            `  ✗ ${entry.key} — ${err instanceof Error ? err.message : err}`
          );
        }
      }
    }

    console.log(`\nDone. Vault: ${vault}`);
  });
