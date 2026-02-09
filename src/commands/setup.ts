import { Command } from "commander";
import { resolve, join } from "path";
import { readFile, writeFile } from "fs/promises";
import { loadConfig, buildEnvKeyToOpRef } from "../config";
import { scanProject, printScanSummary } from "../scanner/project";
import type { ShipkeyConfig, TargetConfig } from "../config";
import { OnePasswordBackend } from "../backends/onepassword";
import { GitHubTarget } from "../targets/github";
import { CloudflareTarget } from "../targets/cloudflare";
import type { SyncTarget, TargetStatus } from "../targets/types";

const TARGETS: Record<string, SyncTarget> = {
  github: new GitHubTarget(),
  cloudflare: new CloudflareTarget(),
};

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

type OpStatus = "not_installed" | "not_logged_in" | "ready";

interface FieldStatusResult {
  statuses: Record<string, Record<string, "stored" | "missing">>;
  opStatus: OpStatus;
}

async function getFieldStatus(
  config: ShipkeyConfig,
  env: string
): Promise<FieldStatusResult> {
  const backend = new OnePasswordBackend();
  const statuses: Record<string, Record<string, "stored" | "missing">> = {};

  if (!config.providers) return { statuses, opStatus: "ready" };

  // Check op status
  const opStatus = await backend.checkStatus();

  const checks: {
    provider: string;
    field: string;
    opRef: string;
  }[] = [];

  for (const [providerName, provider] of Object.entries(config.providers)) {
    statuses[providerName] = {};
    for (const field of provider.fields) {
      if (opStatus !== "ready") {
        statuses[providerName][field] = "missing";
        continue;
      }
      const opRef = `op://${config.vault}/${providerName}/${config.project}-${env}/${field}`;
      checks.push({ provider: providerName, field, opRef });
    }
  }

  if (opStatus !== "ready" || checks.length === 0) return { statuses, opStatus };

  const results = await Promise.allSettled(
    checks.map(async (c) => {
      await backend.readRaw(c.opRef);
      return c;
    })
  );

  for (let i = 0; i < results.length; i++) {
    const check = checks[i];
    statuses[check.provider][check.field] =
      results[i].status === "fulfilled" ? "stored" : "missing";
  }

  return { statuses, opStatus };
}

async function writeLocalEnv(
  projectRoot: string,
  envVars: Record<string, string>
): Promise<void> {
  // Determine target file: .dev.vars for Cloudflare workers, .env.local otherwise
  const hasWrangler = await readFile(join(projectRoot, "wrangler.toml"), "utf-8")
    .then(() => true)
    .catch(() => false);

  const envFile = hasWrangler ? ".dev.vars" : ".env.local";
  const envPath = join(projectRoot, envFile);

  // Read existing content
  let existing = "";
  try {
    existing = await readFile(envPath, "utf-8");
  } catch {
    // file doesn't exist yet
  }

  // Parse existing lines, update or append
  const lines = existing ? existing.split("\n") : [];
  for (const [key, value] of Object.entries(envVars)) {
    const lineIndex = lines.findIndex((l) => l.startsWith(`${key}=`));
    const newLine = `${key}=${value}`;
    if (lineIndex !== -1) {
      lines[lineIndex] = newLine;
    } else {
      // Append, ensuring there's a newline before if file had content
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.splice(lines.length - 1, 0, newLine);
      } else {
        lines.push(newLine);
      }
    }
  }

  const content = lines.join("\n") + (lines[lines.length - 1] !== "" ? "\n" : "");
  await writeFile(envPath, content);
}

async function handleStore(
  config: ShipkeyConfig,
  env: string,
  projectRoot: string,
  body: { provider: string; fields: Record<string, string> }
): Promise<Response> {
  const backend = new OnePasswordBackend();
  const providerConfig = config.providers?.[body.provider];
  if (!providerConfig) {
    return json({ success: false, error: `Unknown provider: ${body.provider}` }, 400);
  }

  const results: { field: string; status: "ok" | "error"; error?: string }[] = [];
  const localEnvVars: Record<string, string> = {};

  for (const [field, value] of Object.entries(body.fields)) {
    if (!value.trim()) continue;
    try {
      await backend.write({
        ref: {
          vault: config.vault,
          provider: body.provider,
          project: config.project,
          env,
          field,
        },
        value,
      });
      // Map field to env var name for local write
      const envKey = providerConfig.env_map[field];
      if (envKey) {
        localEnvVars[envKey] = value;
      }
      results.push({ field, status: "ok" });
    } catch (err) {
      results.push({
        field,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Write to local env file
  if (Object.keys(localEnvVars).length > 0) {
    try {
      await writeLocalEnv(projectRoot, localEnvVars);
    } catch {
      // Don't fail the whole request if local write fails
    }
  }

  return json({ success: results.every((r) => r.status === "ok"), results });
}

async function handleSync(
  config: ShipkeyConfig,
  env: string,
  body: { target: string }
): Promise<Response> {
  const target = TARGETS[body.target];
  if (!target) {
    return json({ success: false, error: `Unknown target: ${body.target}` }, 400);
  }

  const targetConfig = config.targets?.[body.target as keyof typeof config.targets];
  if (!targetConfig) {
    return json({ success: false, error: `No config for target: ${body.target}` }, 400);
  }

  if (!(await target.isAvailable())) {
    return json({ success: false, error: target.installHint() }, 400);
  }

  const backend = new OnePasswordBackend();
  const envKeyMap = buildEnvKeyToOpRef(config, env);
  const results: { destination: string; synced: string[]; failed: string[] }[] = [];

  for (const [destination, secretRefs] of Object.entries(targetConfig)) {
    const secrets: { name: string; value: string }[] = [];

    if (Array.isArray(secretRefs)) {
      for (const envKey of secretRefs) {
        const opRef = envKeyMap.get(envKey);
        if (!opRef) continue;
        try {
          const value = await backend.readRaw(opRef);
          secrets.push({ name: envKey, value });
        } catch {
          // skip unresolvable
        }
      }
    } else {
      for (const [name, ref] of Object.entries(secretRefs)) {
        try {
          const value = await backend.readRaw(ref);
          secrets.push({ name, value });
        } catch {
          // skip unresolvable
        }
      }
    }

    if (secrets.length === 0) {
      results.push({ destination, synced: [], failed: [] });
      continue;
    }

    const result = await target.sync(secrets, destination);
    results.push({
      destination,
      synced: result.success,
      failed: result.failed.map((f) => f.name),
    });
  }

  return json({
    success: results.every((r) => r.failed.length === 0),
    results,
  });
}

function startServer(
  config: ShipkeyConfig,
  env: string,
  projectRoot: string,
  port?: number
): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: port ?? 0,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      if (url.pathname === "/api/config" && req.method === "GET") {
        const { statuses, opStatus } = await getFieldStatus(config, env);
        const providers: Record<string, unknown> = {};
        if (config.providers) {
          for (const [name, provider] of Object.entries(config.providers)) {
            providers[name] = {
              ...provider,
              status: statuses[name] || {},
            };
          }
        }

        // Check target CLI status
        const targetStatus: Record<string, TargetStatus> = {};
        if (config.targets) {
          await Promise.all(
            Object.keys(config.targets).map(async (targetName) => {
              const target = TARGETS[targetName];
              if (target) {
                targetStatus[targetName] = await target.checkStatus();
              }
            })
          );
        }

        return json({
          project: config.project,
          vault: config.vault,
          env,
          providers,
          targets: config.targets || {},
          op_status: opStatus,
          target_status: targetStatus,
        });
      }

      if (url.pathname === "/api/store" && req.method === "POST") {
        const body = await req.json();
        return handleStore(config, env, projectRoot, body);
      }

      if (url.pathname === "/api/sync" && req.method === "POST") {
        const body = await req.json();
        return handleSync(config, env, body);
      }

      return json({ error: "Not found" }, 404);
    },
  });
}

async function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore" });
  } catch {
    console.log(`Open in browser: ${url}`);
  }
}

export const setupCommand = new Command("setup")
  .description("Launch setup wizard in browser")
  .option("-e, --env <env>", "environment (dev/prod)", "prod")
  .option("--port <port>", "API server port")
  .option("--no-open", "don't auto-open browser")
  .argument("[dir]", "project directory", ".")
  .action(async (dir: string, opts: { env: string; port: string; open: boolean }) => {
    const projectRoot = resolve(dir);
    let config;
    try {
      config = await loadConfig(projectRoot);
    } catch {
      console.log("  No shipkey.json found, scanning project...\n");
      const result = await scanProject(projectRoot);
      printScanSummary(result);
      config = result.config;
      const outPath = join(projectRoot, "shipkey.json");
      await writeFile(outPath, JSON.stringify(config, null, 2) + "\n");
      console.log(`\n  ✓ Generated shipkey.json\n`);
    }

    const backend = new OnePasswordBackend();
    if (!(await backend.isAvailable())) {
      console.warn(
        "  Warning: 1Password CLI (op) not found. Store/read operations will fail.\n" +
        "  Install: brew install --cask 1password-cli\n"
      );
    }

    const port = opts.port ? parseInt(opts.port, 10) : undefined;
    const server = startServer(config, opts.env, projectRoot, port);
    const actualPort = server.port;

    const webHost = process.env.SHIPKEY_WEB_URL || "https://shipkey.dev";
    const webUrl = `${webHost}/setup?port=${actualPort}`;

    console.log(`\n  shipkey setup wizard`);
    console.log(`  API: http://localhost:${actualPort}`);
    console.log(`  Project: ${config.project} (${opts.env})\n`);

    if (opts.open) {
      await openBrowser(webUrl);
      console.log(`  Opened: ${webUrl}`);
    } else {
      console.log(`  Open: ${webUrl}`);
    }

    console.log(`\n  Press Ctrl+C to stop.\n`);

    process.on("SIGINT", () => {
      console.log("\n  Shutting down...");
      server.stop();
      process.exit(0);
    });
  });
