import { Command } from "commander";
import { getBackend } from "../backends";
import { loadConfig } from "../config";
import { resolve, basename } from "path";
import { BULLET } from "../symbols";

export const listCommand = new Command("list")
  .description("List keys stored in your password manager")
  .option("-e, --env <env>", "filter by environment")
  .option("--vault <vault>", "Vault or folder name (defaults to shipkey.json vault)")
  .option("--all", "list all projects", false)
  .option("--project <name>", "project name (defaults to directory name)")
  .argument("[dir]", "project directory", ".")
  .action(async (dir: string, opts) => {
    const projectRoot = resolve(dir);
    const project = opts.all ? undefined : (opts.project || basename(projectRoot));
    const env = opts.env;

    let backendName = "1password";
    let vault: string | undefined = opts.vault;
    try {
      const config = await loadConfig(projectRoot);
      if (config.backend) backendName = config.backend;
      if (!vault && config.vault) vault = config.vault;
    } catch {
      // No config file — use default backend
    }
    const backend = getBackend(backendName);

    if (!(await backend.isAvailable())) {
      console.error(
        `Error: ${backend.name} CLI not available. Run 'shipkey setup' for installation instructions.`
      );
      process.exit(1);
    }

    const refs = await backend.list(project, env, vault);

    if (refs.length === 0) {
      const scope = opts.all ? "any project" : `${project}${env ? `.${env}` : ""}`;
      console.log(`No keys found for ${scope}.`);
      return;
    }

    // Group by provider
    const grouped = new Map<string, typeof refs>();
    for (const ref of refs) {
      const key = `${ref.provider} (${ref.project}.${ref.env})`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(ref);
    }

    console.log(`Found ${refs.length} keys:\n`);
    for (const [group, items] of grouped) {
      console.log(`  ${group}`);
      for (const item of items) {
        console.log(`    ${BULLET} ${item.field}`);
      }
    }
  });
