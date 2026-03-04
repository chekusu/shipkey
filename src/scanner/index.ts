import { readdir, readFile } from "fs/promises";
import { join, relative, dirname } from "path";
import { parseDotenv } from "./parsers/dotenv";
import type { ScanResult, SubProjectGroup, ScannedFile, EnvVar } from "./types";

const ENV_PATTERNS = [
  /^\.env$/,
  /^\.env\..+$/, // .env.local, .env.example, etc.
  /^\.dev\.vars$/,
  /^\.dev\.vars\..+$/, // .dev.vars.example
];

export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
]);

function isEnvFile(filename: string): boolean {
  return ENV_PATTERNS.some((p) => p.test(filename));
}

function isTemplate(filename: string): boolean {
  return filename.includes(".example") || filename.includes(".template");
}

async function walkDir(
  dir: string,
  rootDir: string,
  files: { path: string; fullPath: string }[]
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkDir(join(dir, entry.name), rootDir, files);
    } else if (isEnvFile(entry.name)) {
      const fullPath = join(dir, entry.name);
      files.push({
        path: relative(rootDir, fullPath),
        fullPath,
      });
    }
  }
}

// Scan all .env files recursively (used by setup wizard)
export async function scan(projectRoot: string): Promise<ScanResult> {
  const foundFiles: { path: string; fullPath: string }[] = [];
  await walkDir(projectRoot, projectRoot, foundFiles);

  const groupMap = new Map<string, ScannedFile[]>();

  for (const file of foundFiles) {
    const content = await readFile(file.fullPath, "utf-8");
    const parsed = parseDotenv(content);
    const template = isTemplate(file.path);

    const vars: EnvVar[] = parsed.map((v) => ({
      key: v.key,
      value: template ? undefined : v.value,
      source: file.path,
      isTemplate: template,
    }));

    const groupKey = dirname(file.path) === "." ? "." : dirname(file.path);

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, []);
    }

    groupMap.get(groupKey)!.push({
      path: file.path,
      isTemplate: template,
      vars,
    });
  }

  const groups: SubProjectGroup[] = Array.from(groupMap.entries()).map(
    ([path, files]) => ({ path, files })
  );

  const totalFiles = foundFiles.length;
  const totalVars = groups.reduce(
    (sum, g) => sum + g.files.reduce((s, f) => s + f.vars.length, 0),
    0
  );

  return { projectRoot, groups, totalVars, totalFiles };
}

// Scan only immediate .env files in a single directory (no recursion)
export async function scanSingleDir(dir: string): Promise<ScanResult> {
  const entries = await readdir(dir, { withFileTypes: true });
  const foundFiles: { path: string; fullPath: string }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() && isEnvFile(entry.name)) {
      foundFiles.push({ path: entry.name, fullPath: join(dir, entry.name) });
    }
  }

  const groupMap = new Map<string, ScannedFile[]>();

  for (const file of foundFiles) {
    const content = await readFile(file.fullPath, "utf-8");
    const parsed = parseDotenv(content);
    const template = isTemplate(file.path);

    const vars: EnvVar[] = parsed.map((v) => ({
      key: v.key,
      value: template ? undefined : v.value,
      source: file.path,
      isTemplate: template,
    }));

    if (!groupMap.has(".")) groupMap.set(".", []);
    groupMap.get(".")!.push({ path: file.path, isTemplate: template, vars });
  }

  const groups: SubProjectGroup[] = Array.from(groupMap.entries()).map(
    ([path, files]) => ({ path, files })
  );

  const totalFiles = foundFiles.length;
  const totalVars = groups.reduce(
    (sum, g) => sum + g.files.reduce((s, f) => s + f.vars.length, 0),
    0
  );

  return { projectRoot: dir, groups, totalVars, totalFiles };
}

// Find all directories containing .env files (recursive)
export async function walkDirsWithEnv(root: string): Promise<string[]> {
  const result: string[] = [];
  await collectEnvDirs(root, result);
  return result;
}

async function collectEnvDirs(dir: string, result: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  let hasEnvFile = false;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await collectEnvDirs(join(dir, entry.name), result);
      }
    } else if (isEnvFile(entry.name)) {
      hasEnvFile = true;
    }
  }

  if (hasEnvFile) result.push(dir);
}

// Find all directories containing shipkey.json (recursive)
export async function walkDirsWithShipkey(root: string): Promise<string[]> {
  const result: string[] = [];
  await collectShipkeyDirs(root, result);
  return result;
}

async function collectShipkeyDirs(dir: string, result: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  let hasShipkey = false;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await collectShipkeyDirs(join(dir, entry.name), result);
      }
    } else if (entry.name === "shipkey.json") {
      hasShipkey = true;
    }
  }

  if (hasShipkey) result.push(dir);
}
