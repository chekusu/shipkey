import { readdir, readFile } from "fs/promises";
import { join } from "path";

export interface PackageJsonScanResult {
  dependencies: string[];
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
]);

async function walkForPackageJsons(
  dir: string,
  results: string[]
): Promise<void> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkForPackageJsons(join(dir, entry.name), results);
    } else if (entry.name === "package.json") {
      results.push(join(dir, entry.name));
    }
  }
}

export async function scanPackageJsons(
  projectRoot: string
): Promise<PackageJsonScanResult> {
  const files: string[] = [];
  await walkForPackageJsons(projectRoot, files);

  const allDeps = new Set<string>();

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, "utf-8");
      const pkg = JSON.parse(content);

      for (const dep of Object.keys(pkg.dependencies || {})) {
        allDeps.add(dep);
      }
      for (const dep of Object.keys(pkg.devDependencies || {})) {
        allDeps.add(dep);
      }
    } catch {
      // skip invalid package.json
    }
  }

  return { dependencies: [...allDeps] };
}
