// Helper for sync-env-e2e.test.ts. Runs in a child process whose PATH
// contains a stub `gh` binary (Bun.spawn resolves binaries from the
// process's initial environment, so the stub must be on PATH at startup).
//
// Starts the setup server with startup env "prod", seeds a key that only
// exists in "dev", exercises /api/sync three ways, and prints the
// observations as JSON.
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { startServer } from "../../src/commands/setup";
import { MockBackend } from "./mock-backend";

const TMP = process.argv[2];
if (!TMP) {
  console.error("usage: bun sync-env-runner.ts <tmp-dir>");
  process.exit(1);
}

mkdirSync(TMP, { recursive: true });

const config = {
  project: "testapp",
  vault: "shipkey",
  providers: {
    OpenAI: { fields: ["OPENAI_API_KEY"] },
  },
  targets: {
    github: { "owner/repo": ["OPENAI_API_KEY"] },
  },
};
const configPath = join(TMP, "shipkey.json");
writeFileSync(configPath, JSON.stringify(config, null, 2));

const backend = new MockBackend();
// Server starts with env="prod"; the key only exists in "dev".
backend.seed("OpenAI", "testapp", "dev", "OPENAI_API_KEY", "sk-dev-123");

const server = startServer(configPath, "prod", TMP, backend);
const baseUrl = `http://localhost:${server.port}`;

async function callSync(query: string, body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/api/sync${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const readEnvs = backend.calls
    .filter((c) => c.method === "read")
    .map((c) => c.args[0].env);
  backend.calls.length = 0;
  return { data, readEnvs };
}

const results = {
  queryParam: await callSync("?env=dev", { target: "github" }),
  bodyEnv: await callSync("", { target: "github", env: "dev" }),
  fallback: await callSync("", { target: "github" }),
};

server.stop();
rmSync(TMP, { recursive: true, force: true });
console.log(JSON.stringify(results));
