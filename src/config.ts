import { readFile } from "fs/promises";
import { join } from "path";

export interface PermissionHint {
  permission: string;
  source: string;
}

export interface ProviderConfig {
  fields: string[];
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
  backend?: string; // "1password" | "bitwarden", defaults to "1password"
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

import type { SecretBackend, SecretRef } from "./backends/types";

export function configuredSecretRefs(config: ShipkeyConfig, env = "prod"): Map<string, SecretRef> {
  const refs = new Map<string, SecretRef>();
  for (const [provider, entry] of Object.entries(config.providers ?? {})) {
    for (const field of entry.fields) {
      refs.set(field, { vault: config.vault, project: config.project, env, provider, field });
    }
  }
  return refs;
}

/**
 * Build a map of env key → inline reference (e.g. op:// URI).
 * For backends that don't support inline refs (e.g. Bitwarden), values will be null.
 */
export function buildSecretRefMap(
  config: ShipkeyConfig,
  backend: SecretBackend,
  env = "prod"
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const [field, ref] of configuredSecretRefs(config, env)) {
    map.set(field, backend.buildInlineRef?.(ref) ?? null);
  }
  return map;
}

/** @deprecated Use buildSecretRefMap instead */
export function buildEnvKeyToOpRef(
  config: ShipkeyConfig,
  env = "prod"
): Map<string, string> {
  const map = new Map<string, string>();
  if (!config.providers) return map;

  for (const [providerName, provider] of Object.entries(config.providers)) {
    for (const field of provider.fields) {
      const opRef = `op://${config.vault}/${providerName}/${config.project}-${env}/${field}`;
      map.set(field, opRef);
    }
  }
  return map;
}
