import { basename, join } from "path";
import { readFile } from "fs/promises";
import { scan } from "./index";
import { scanWorkflows, detectGitRepo } from "./parsers/workflow";
import { scanWrangler } from "./parsers/wrangler";
import { scanPackageJsons } from "./parsers/packagejson";
import { inferPermissions } from "./permissions";
import { groupByProvider } from "../providers";
import type { ShipkeyConfig, TargetConfig } from "../config";
import type { ScanResult } from "./types";
import type { WorkflowScanResult } from "./parsers/workflow";
import type { WranglerScanResult } from "./parsers/wrangler";

export interface ProjectScanStats {
  envFiles: number;
  envVars: number;
  workflowFiles: number;
  workflowSecrets: number;
  gitRepo: string | null;
  wranglerFile: string | null;
  wranglerProjects: string[];
}

export interface ProjectScanResult {
  config: ShipkeyConfig;
  stats: ProjectScanStats;
  workflowSecrets: string[];
}

export async function scanProject(
  projectRoot: string
): Promise<ProjectScanResult> {
  // Run all scans in parallel
  const [envResult, workflowResult, wranglerResult, gitRepo, pkgResult] =
    await Promise.all([
      scan(projectRoot),
      scanWorkflows(projectRoot),
      scanWrangler(projectRoot),
      detectGitRepo(projectRoot),
      scanPackageJsons(projectRoot),
    ]);

  // Collect all env keys from scanned files (deduplicated)
  const envKeys = collectEnvKeys(envResult);

  // Merge workflow secrets into env keys
  const allKeys = new Set(envKeys);
  for (const secret of workflowResult.secrets) {
    allKeys.add(secret);
  }

  // Group by provider
  const providers = groupByProvider([...allKeys]);

  // Infer permissions from project signals
  inferPermissions(
    providers,
    pkgResult.dependencies,
    wranglerResult.bindings,
    wranglerResult.file,
    workflowResult.wranglerCommands
  );

  // Build targets
  const targets = buildTargets(
    workflowResult,
    wranglerResult,
    gitRepo,
    envResult
  );

  const projectName = await detectProjectName(projectRoot);

  const config: ShipkeyConfig = {
    project: projectName,
    vault: "shipkey",
    providers,
    ...(Object.keys(targets).length > 0 && { targets }),
  };

  const stats: ProjectScanStats = {
    envFiles: envResult.totalFiles,
    envVars: envResult.totalVars,
    workflowFiles: workflowResult.files.length,
    workflowSecrets: workflowResult.secrets.length,
    gitRepo,
    wranglerFile: wranglerResult.file,
    wranglerProjects: wranglerResult.projects,
  };

  return { config, stats, workflowSecrets: workflowResult.secrets };
}

function collectEnvKeys(result: ScanResult): string[] {
  const keys = new Set<string>();
  for (const group of result.groups) {
    for (const file of group.files) {
      for (const v of file.vars) {
        keys.add(v.key);
      }
    }
  }
  return [...keys];
}

function buildTargets(
  workflow: WorkflowScanResult,
  wrangler: WranglerScanResult,
  gitRepo: string | null,
  envResult: ScanResult
): NonNullable<ShipkeyConfig["targets"]> {
  const targets: NonNullable<ShipkeyConfig["targets"]> = {};

  // GitHub target: if we have workflow secrets and a git repo
  if (workflow.secrets.length > 0 && gitRepo) {
    targets.github = {
      [gitRepo]: workflow.secrets,
    } as TargetConfig;
  }

  // Cloudflare target: if we have wrangler projects and .dev.vars variables
  if (wrangler.projects.length > 0) {
    const devVarsKeys = collectDevVarsKeys(envResult);
    if (devVarsKeys.length > 0) {
      const cfTarget: TargetConfig = {};
      for (const project of wrangler.projects) {
        cfTarget[project] = devVarsKeys;
      }
      targets.cloudflare = cfTarget;
    }
  }

  return targets;
}

async function detectProjectName(projectRoot: string): Promise<string> {
  try {
    const raw = await readFile(join(projectRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    if (pkg.name && typeof pkg.name === "string") return pkg.name;
  } catch {
    // no package.json or invalid
  }
  return basename(projectRoot);
}

export function printScanSummary({ config, stats, workflowSecrets }: ProjectScanResult) {
  console.log(
    `  Env files: ${stats.envFiles} files, ${stats.envVars} variables`
  );

  if (stats.workflowFiles > 0) {
    console.log(
      `  Workflows: ${stats.workflowFiles} files, ${stats.workflowSecrets} secrets`
    );
    for (const secret of workflowSecrets) {
      console.log(`    · ${secret}`);
    }
  }

  if (stats.gitRepo) {
    console.log(`  Git repo:  ${stats.gitRepo}`);
  }

  if (stats.wranglerFile) {
    console.log(
      `  Wrangler:  ${stats.wranglerFile} → ${stats.wranglerProjects.join(", ")}`
    );
  }

  const providerNames = Object.keys(config.providers || {});
  if (providerNames.length > 0) {
    console.log(`\n  Providers (${providerNames.length}):`);
    for (const [name, provider] of Object.entries(config.providers || {})) {
      const envKeys = Object.values(provider.env_map).join(", ");
      console.log(`    ${name}: ${envKeys}`);
      if (provider.permissions && provider.permissions.length > 0) {
        const perms = provider.permissions.map((p) => p.permission).join(", ");
        console.log(`      → ${perms}`);
      }
    }
  }

  if (config.targets) {
    const targetEntries: string[] = [];
    if (config.targets.github) {
      for (const [dest, keys] of Object.entries(config.targets.github)) {
        const count = Array.isArray(keys) ? keys.length : Object.keys(keys).length;
        targetEntries.push(`  github/${dest}: ${count} secrets`);
      }
    }
    if (config.targets.cloudflare) {
      for (const [dest, keys] of Object.entries(config.targets.cloudflare)) {
        const count = Array.isArray(keys) ? keys.length : Object.keys(keys).length;
        targetEntries.push(`  cloudflare/${dest}: ${count} secrets`);
      }
    }
    if (targetEntries.length > 0) {
      console.log(`\n  Targets:`);
      for (const entry of targetEntries) {
        console.log(`  ${entry}`);
      }
    }
  }
}

function collectDevVarsKeys(result: ScanResult): string[] {
  const keys = new Set<string>();
  for (const group of result.groups) {
    for (const file of group.files) {
      if (
        file.path.includes(".dev.vars") &&
        !file.isTemplate
      ) {
        for (const v of file.vars) {
          keys.add(v.key);
        }
      }
    }
  }
  return [...keys];
}
