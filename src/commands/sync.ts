import { Command } from "commander";
import { resolve } from "path";
import { getBackend } from "../backends";
import type { SecretBackend, SecretRef } from "../backends/types";
import { GitHubTarget } from "../targets/github";
import { TICK, CROSS, ARROW } from "../symbols";
import { CloudflareTarget } from "../targets/cloudflare";
import type { SyncTarget } from "../targets/types";
import { loadConfig, configuredSecretRefs } from "../config";
import type { TargetConfig } from "../config";

const TARGETS: Record<string, SyncTarget> = {
  github: new GitHubTarget(),
  cloudflare: new CloudflareTarget(),
};

async function resolveSecret(
  nameOrRef: string,
  refMap: Map<string, SecretRef>,
  backend: SecretBackend
): Promise<{ name: string; value: string }> {
  // For 1Password backend, check if it's a direct op:// reference
  if (nameOrRef.startsWith("op://") && "readRaw" in backend) {
    const value = await (backend as any).readRaw(nameOrRef);
    return { name: nameOrRef, value };
  }

  const ref = refMap.get(nameOrRef);
  if (ref) return { name: nameOrRef, value: await backend.read(ref) };

  throw new Error(
    `Cannot resolve secret "${nameOrRef}". Ensure it's configured in providers in shipkey.json.`
  );
}

export async function syncTarget(
  target: SyncTarget,
  config: TargetConfig,
  refMap: Map<string, SecretRef>,
  backend: SecretBackend
): Promise<number> {
  console.log(`Syncing to ${target.name}...\n`);

  if (!(await target.isAvailable())) {
    console.error(`Error: ${target.installHint()}`);
    return 1;
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
          const secret = await resolveSecret(envKey, refMap, backend);
          secrets.push(secret);
        } catch (err) {
          console.error(
            `  ${CROSS} ${envKey} — ${err instanceof Error ? err.message : err}`
          );
          totalFailed++;
        }
      }
    } else {
      // Record format: { "SECRET_NAME": "op://..." }
      for (const [name, ref] of Object.entries(secretRefs)) {
        try {
          if (ref.startsWith("op://") && "readRaw" in backend) {
            const value = await (backend as any).readRaw(ref);
            secrets.push({ name, value });
          } else {
            const secret = await resolveSecret(name, refMap, backend);
            secrets.push(secret);
          }
        } catch (err) {
          console.error(
            `  ${CROSS} ${name} — ${err instanceof Error ? err.message : err}`
          );
          totalFailed++;
        }
      }
    }

    if (secrets.length === 0) continue;

    const result = await target.sync(secrets, destination);

    for (const name of result.success) {
      console.log(`  ${TICK} ${name} ${ARROW} ${destination}`);
      totalSynced++;
    }
    for (const { name, error } of result.failed) {
      console.error(`  ${CROSS} ${name} ${ARROW} ${destination} — ${error}`);
      totalFailed++;
    }
  }

  if (totalFailed > 0) {
    console.log(`\n  Done. ${totalSynced} synced, ${totalFailed} failed.\n`);
  } else {
    console.log(`\n  Done. ${totalSynced} secrets synced.\n`);
  }
  return totalFailed;
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

    const backend = getBackend(config.backend);
    if (!(await backend.isAvailable())) {
      console.error(
        `Error: ${backend.name} CLI not available. Run 'shipkey setup' for installation instructions.`
      );
      process.exit(1);
    }

    const refMap = configuredSecretRefs(config);

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
        process.exitCode = 1;
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

      if (await syncTarget(target, targetConfig, refMap, backend)) process.exitCode = 1;
    }
  });
