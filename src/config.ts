import { readFile } from "fs/promises";
import { join } from "path";

export interface PermissionHint {
  permission: string;
  source: string;
}

export interface ProviderConfig {
  fields: string[];
  env_map: Record<string, string>;
  guide_url?: string;
  guide?: string;
  permissions?: PermissionHint[];
}

export interface TargetConfig {
  [destination: string]: string[] | Record<string, string>;
}

export interface ShipkeyConfig {
  project: string;
  vault: string;
  providers?: Record<string, ProviderConfig>;
  targets?: {
    github?: TargetConfig;
    cloudflare?: TargetConfig;
  };
}

export async function loadConfig(dir: string): Promise<ShipkeyConfig> {
  const configPath = join(dir, "shipkey.json");
  try {
    const raw = await readFile(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `Cannot read ${configPath}. Run 'shipkey init' or create it manually.`
    );
  }
}

export function buildEnvKeyToOpRef(
  config: ShipkeyConfig,
  env = "prod"
): Map<string, string> {
  const map = new Map<string, string>();
  if (!config.providers) return map;

  for (const [providerName, provider] of Object.entries(config.providers)) {
    for (const [field, envKey] of Object.entries(provider.env_map)) {
      const opRef = `op://${config.vault}/${providerName}/${config.project}-${env}/${field}`;
      map.set(envKey, opRef);
    }
  }
  return map;
}
