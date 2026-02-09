import { Command } from "commander";
import { resolve } from "path";
import { OnePasswordBackend } from "../backends/onepassword";
import { GitHubTarget } from "../targets/github";
import { CloudflareTarget } from "../targets/cloudflare";
import type { SyncTarget } from "../targets/types";
import { loadConfig, buildEnvKeyToOpRef } from "../config";
import type { TargetConfig } from "../config";

const TARGETS: Record<string, SyncTarget> = {
  github: new GitHubTarget(),
  cloudflare: new CloudflareTarget(),
};

async function resolveSecret(
  nameOrRef: string,
  envKeyMap: Map<string, string>,
  backend: OnePasswordBackend
): Promise<{ name: string; value: string }> {
  if (nameOrRef.startsWith("op://")) {
    const value = await backend.readRaw(nameOrRef);
    return { name: nameOrRef, value };
  }

  // Look up env key name in providers config
  const opRef = envKeyMap.get(nameOrRef);
  if (!opRef) {
    throw new Error(
      `No op:// reference found for "${nameOrRef}". Add it to providers.env_map in shipkey.json.`
    );
  }
  const value = await backend.readRaw(opRef);
  return { name: nameOrRef, value };
}

async function syncTarget(
  target: SyncTarget,
  config: TargetConfig,
  envKeyMap: Map<string, string>,
  backend: OnePasswordBackend
): Promise<void> {
  console.log(`Syncing to ${target.name}...\n`);

  if (!(await target.isAvailable())) {
    console.error(`Error: ${target.installHint()}`);
    return;
  }

  let totalSynced = 0;
  let totalFailed = 0;

  for (const [destination, secretRefs] of Object.entries(config)) {
    const secrets: { name: string; value: string }[] = [];

    if (Array.isArray(secretRefs)) {
      // Array format: ["NPM_TOKEN", "CLOUDFLARE_API_TOKEN"]
      // Resolve env key names via providers config
      for (const envKey of secretRefs) {
        try {
          const secret = await resolveSecret(envKey, envKeyMap, backend);
          secrets.push(secret);
        } catch (err) {
          console.error(
            `  ✗ ${envKey} — ${err instanceof Error ? err.message : err}`
          );
          totalFailed++;
        }
      }
    } else {
      // Record format: { "SECRET_NAME": "op://..." }
      for (const [name, ref] of Object.entries(secretRefs)) {
        try {
          const value = await backend.readRaw(ref);
          secrets.push({ name, value });
        } catch (err) {
          console.error(
            `  ✗ ${name} — ${err instanceof Error ? err.message : err}`
          );
          totalFailed++;
        }
      }
    }

    if (secrets.length === 0) continue;

    const result = await target.sync(secrets, destination);

    for (const name of result.success) {
      console.log(`  ✓ ${name} → ${destination}`);
      totalSynced++;
    }
    for (const { name, error } of result.failed) {
      console.error(`  ✗ ${name} → ${destination} — ${error}`);
      totalFailed++;
    }
  }

  if (totalFailed > 0) {
    console.log(`\n  Done. ${totalSynced} synced, ${totalFailed} failed.\n`);
  } else {
    console.log(`\n  Done. ${totalSynced} secrets synced.\n`);
  }
}

export const syncCommand = new Command("sync")
  .description(
    "Sync secrets to external platforms (GitHub Actions, Cloudflare)"
  )
  .argument("[target]", "target platform (github, cloudflare)")
  .argument("[dir]", "project directory", ".")
  .action(async (targetArg: string | undefined, dir: string) => {
    const projectRoot = resolve(dir);
    const config = await loadConfig(projectRoot);

    if (!config.targets) {
      console.error(
        'No "targets" configured in shipkey.json. Add a targets section to sync secrets.'
      );
      process.exit(1);
    }

    const backend = new OnePasswordBackend();
    if (!(await backend.isAvailable())) {
      console.error(
        "Error: 1Password CLI (op) not found. Install: brew install --cask 1password-cli"
      );
      process.exit(1);
    }

    const envKeyMap = buildEnvKeyToOpRef(config);

    // Determine which targets to sync
    const targetNames = targetArg
      ? [targetArg]
      : Object.keys(config.targets);

    for (const name of targetNames) {
      const target = TARGETS[name];
      if (!target) {
        console.error(
          `Unknown target: ${name}. Available: ${Object.keys(TARGETS).join(", ")}`
        );
        continue;
      }

      const targetConfig =
        config.targets[name as keyof typeof config.targets];
      if (!targetConfig) {
        console.log(
          `No configuration for target "${name}" in shipkey.json. Skipping.`
        );
        continue;
      }

      await syncTarget(target, targetConfig, envKeyMap, backend);
    }
  });
