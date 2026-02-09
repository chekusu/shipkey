import { Command } from "commander";
import { scan } from "../scanner";
import { OnePasswordBackend } from "../backends/onepassword";
import { guessProvider, envKeyToField } from "../providers";
import { resolve, basename } from "path";

export const pushCommand = new Command("push")
  .description("Push env values from local files to 1Password")
  .option("-e, --env <env>", "environment (dev/prod)", "dev")
  .option("--vault <vault>", "1Password vault name", "shipkey")
  .option("--project <name>", "project name (defaults to directory name)")
  .argument("[dir]", "project directory", ".")
  .action(async (dir: string, opts) => {
    const projectRoot = resolve(dir);
    const project = opts.project || basename(projectRoot);
    const env = opts.env;
    const vault = opts.vault;

    const backend = new OnePasswordBackend();

    if (!(await backend.isAvailable())) {
      console.error(
        "Error: 1Password CLI (op) not found. Install: brew install --cask 1password-cli"
      );
      process.exit(1);
    }

    console.log(`Scanning ${projectRoot}...\n`);
    const result = await scan(projectRoot);

    // Collect real (non-template) vars with values
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
      console.log("No env values found to push. Only template files?");
      return;
    }

    console.log(`Pushing ${entries.length} keys to 1Password...\n`);

    for (const entry of entries) {
      try {
        await backend.write({
          ref: {
            vault,
            provider: entry.provider,
            project,
            env,
            field: envKeyToField(entry.key),
          },
          value: entry.value,
        });
        console.log(`  ✓ ${entry.key} → 1Password`);
      } catch (err) {
        console.error(
          `  ✗ ${entry.key} — ${err instanceof Error ? err.message : err}`
        );
      }
    }

    console.log(`\nDone. Saved to vault: ${vault}`);
  });
