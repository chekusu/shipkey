import { readFile } from "fs/promises";
import { join } from "path";

export interface WranglerScanResult {
  projects: string[];
  file: string | null;
  bindings: string[];
}

const TOML_NAME_RE = /^name\s*=\s*"([^"]+)"/m;
const TOML_SECTION_RE = /^\[\[(\w+)\]\]/gm;
const TOML_ROUTE_RE = /^routes?\s*=/m;

const CANDIDATES = ["wrangler.toml", "wrangler.jsonc", "wrangler.json"];

const KNOWN_BINDINGS = new Set([
  "kv_namespaces",
  "r2_buckets",
  "d1_databases",
  "queues",
  "analytics_engine_datasets",
  "ai",
  "durable_objects",
]);

export async function scanWrangler(
  projectRoot: string
): Promise<WranglerScanResult> {
  for (const filename of CANDIDATES) {
    const fullPath = join(projectRoot, filename);
    let content: string;
    try {
      content = await readFile(fullPath, "utf-8");
    } catch {
      continue;
    }

    const projects: string[] = [];
    const bindings: string[] = [];

    if (filename === "wrangler.toml") {
      const match = TOML_NAME_RE.exec(content);
      if (match) projects.push(match[1]);

      // Extract [[section]] bindings
      let sectionMatch: RegExpExecArray | null;
      TOML_SECTION_RE.lastIndex = 0;
      while ((sectionMatch = TOML_SECTION_RE.exec(content)) !== null) {
        const section = sectionMatch[1];
        if (KNOWN_BINDINGS.has(section) && !bindings.includes(section)) {
          bindings.push(section);
        }
      }

      // Check for route/routes
      if (TOML_ROUTE_RE.test(content) && !bindings.includes("routes")) {
        bindings.push("routes");
      }
    } else {
      // wrangler.jsonc or wrangler.json — strip comments then parse
      try {
        const stripped = content.replace(
          /\/\/.*$|\/\*[\s\S]*?\*\//gm,
          ""
        );
        const parsed = JSON.parse(stripped);
        if (parsed.name) projects.push(parsed.name);

        // Check top-level keys for bindings
        for (const key of Object.keys(parsed)) {
          if (KNOWN_BINDINGS.has(key) && !bindings.includes(key)) {
            bindings.push(key);
          }
        }

        // Check for route/routes
        if ((parsed.route || parsed.routes) && !bindings.includes("routes")) {
          bindings.push("routes");
        }
      } catch {
        // invalid JSON, skip
      }
    }

    if (projects.length > 0) {
      return { projects, file: filename, bindings };
    }
  }

  return { projects: [], file: null, bindings: [] };
}
