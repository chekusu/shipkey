import { readFile, writeFile, access } from "fs/promises";
import { join } from "path";

/**
 * Check if a file exists at the given path.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect which env file to write to based on the project root contents.
 *
 * Priority:
 *  1. `wrangler.toml` exists → `.dev.vars` (Cloudflare Workers convention)
 *  2. `.env` exists → `.env`
 *  3. `.env.local` exists → `.env.local`
 *  4. default → `.env`
 */
export async function detectEnvFile(projectRoot: string): Promise<string> {
  if (await fileExists(join(projectRoot, "wrangler.toml"))) {
    return ".dev.vars";
  }
  if (await fileExists(join(projectRoot, ".env"))) {
    return ".env";
  }
  if (await fileExists(join(projectRoot, ".env.local"))) {
    return ".env.local";
  }
  return ".env";
}

/**
 * Format a value for env file output.
 * Wraps in double quotes and escapes special characters when the value
 * contains newlines, leading/trailing whitespace, or inline comments.
 */
export function formatEnvValue(value: string): string {
  const needsQuoting =
    value.includes("\n") ||
    value.includes("\r") ||
    value.startsWith(" ") ||
    value.endsWith(" ") ||
    value.includes("#");

  if (!needsQuoting) return value;

  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");

  return `"${escaped}"`;
}

/** Check if a string matches a valid env variable name */
function isValidEnvKey(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

/**
 * Check if a double-quoted string (starting with `"`) has a closing unescaped `"`.
 */
function isQuoteClosed(s: string): boolean {
  let i = 1; // skip opening quote
  while (i < s.length) {
    if (s[i] === "\\") {
      i += 2;
      continue;
    }
    if (s[i] === '"') return true;
    i++;
  }
  return false;
}

/** Check if a line contains an unescaped double quote */
function hasClosingQuote(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") {
      i++;
      continue;
    }
    if (line[i] === '"') return true;
  }
  return false;
}

interface EnvFileEntry {
  key?: string; // undefined for comments, blanks, non-kv lines
  startLine: number;
  endLine: number; // inclusive
}

/**
 * Parse env file lines into structured entries.
 * Handles multi-line quoted values and orphan continuation lines
 * from corrupted writes (e.g. unquoted PEM keys split across lines).
 */
function parseEnvEntries(lines: string[]): EnvFileEntry[] {
  const entries: EnvFileEntry[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank or comment
    if (trimmed === "" || trimmed.startsWith("#")) {
      entries.push({ startLine: i, endLine: i });
      i++;
      continue;
    }

    const eqIdx = line.indexOf("=");
    const potentialKey = eqIdx > 0 ? line.slice(0, eqIdx).trim() : "";

    // Not a valid KEY=VALUE line — likely orphan continuation from corrupted multi-line write
    if (eqIdx === -1 || !isValidEnvKey(potentialKey)) {
      const lastEntry =
        entries.length > 0 ? entries[entries.length - 1] : null;
      if (lastEntry?.key) {
        // Attach to preceding key-value entry as continuation
        lastEntry.endLine = i;
      } else {
        entries.push({ startLine: i, endLine: i });
      }
      i++;
      continue;
    }

    const key = potentialKey;
    const afterEq = line.slice(eqIdx + 1);
    const valuePart = afterEq.trimStart();

    // Multi-line double-quoted value: starts with " but no closing "
    if (valuePart.startsWith('"') && !isQuoteClosed(valuePart)) {
      const start = i;
      while (i + 1 < lines.length) {
        i++;
        if (hasClosingQuote(lines[i])) break;
      }
      entries.push({ key, startLine: start, endLine: i });
    } else {
      entries.push({ key, startLine: i, endLine: i });
    }

    i++;
  }

  return entries;
}

/**
 * Merge env vars into a string of env file content.
 * Updates existing keys in-place, appends new keys, preserves comments and blanks.
 * Properly handles multi-line quoted values and corrupted unquoted multi-line values.
 */
export function mergeEnvContent(
  existing: string,
  envVars: Record<string, string>
): string {
  const lines = existing ? existing.split("\n") : [];
  const entries = parseEnvEntries(lines);
  const updatedKeys = new Set<string>();

  // Build new lines, replacing matched entries
  const newLines: string[] = [];

  for (const entry of entries) {
    const matchingKey = entry.key
      ? Object.keys(envVars).find((k) => k === entry.key)
      : undefined;

    if (matchingKey) {
      newLines.push(`${matchingKey}=${formatEnvValue(envVars[matchingKey])}`);
      updatedKeys.add(matchingKey);
    } else {
      // Preserve original lines
      for (let j = entry.startLine; j <= entry.endLine; j++) {
        newLines.push(lines[j]);
      }
    }
  }

  // Append new keys (those not updated in-place)
  const appendKeys = Object.entries(envVars).filter(
    ([k]) => !updatedKeys.has(k)
  );

  for (const [key, value] of appendKeys) {
    const formatted = `${key}=${formatEnvValue(value)}`;
    if (newLines.length > 0 && newLines[newLines.length - 1] === "") {
      newLines.splice(newLines.length - 1, 0, formatted);
    } else {
      newLines.push(formatted);
    }
  }

  // Ensure file ends with a newline
  return (
    newLines.join("\n") + (newLines[newLines.length - 1] !== "" ? "\n" : "")
  );
}

/**
 * Merge env vars into the appropriate env file for the project.
 *
 * - Calls `detectEnvFile` to determine the target file
 * - Reads existing file content (if any)
 * - Updates existing keys in-place (matches `^KEY=` pattern)
 * - Appends new keys at end
 * - Preserves comments, blank lines, and unmanaged keys
 * - Properly escapes multi-line values (e.g. PEM keys)
 *
 * @returns The filename that was written to (e.g. ".env", ".dev.vars")
 */
export async function writeEnvFile(
  projectRoot: string,
  envVars: Record<string, string>
): Promise<string> {
  const envFile = await detectEnvFile(projectRoot);
  const envPath = join(projectRoot, envFile);

  // Read existing content
  let existing = "";
  try {
    existing = await readFile(envPath, "utf-8");
  } catch {
    // File doesn't exist yet — start empty
  }

  const content = mergeEnvContent(existing, envVars);
  await writeFile(envPath, content);
  return envFile;
}
