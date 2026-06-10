import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, chmodSync } from "fs";
import { join } from "path";

// e2e: /api/sync must resolve the environment per-request (query param /
// body), like /api/push and /api/store, instead of using the startup env.
//
// The server is run in a child process (test/helpers/sync-env-runner.ts)
// with a stub `gh` binary on PATH, because Bun.spawn resolves binaries from
// the process's initial environment.

const TMP = join(import.meta.dir, "__sync_env_e2e_fixtures__");
const STUB_DIR = join(TMP, "bin");
const RUNNER = join(import.meta.dir, "..", "helpers", "sync-env-runner.ts");

// Stub `gh` CLI: auth status and secret set always succeed.
const GH_STUB = `#!/usr/bin/env bash
exit 0
`;

type SyncObservation = {
  data: { success: boolean; results: { synced: string[] }[] };
  readEnvs: string[];
};

let results: {
  queryParam: SyncObservation;
  bodyEnv: SyncObservation;
  fallback: SyncObservation;
};

beforeAll(async () => {
  mkdirSync(STUB_DIR, { recursive: true });
  const stubPath = join(STUB_DIR, "gh");
  writeFileSync(stubPath, GH_STUB);
  chmodSync(stubPath, 0o755);

  const proc = Bun.spawn(["bun", RUNNER, join(TMP, "project")], {
    env: { ...process.env, PATH: `${STUB_DIR}:${process.env.PATH}` },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`sync-env-runner failed (${exitCode}): ${stderr}`);
  }
  results = JSON.parse(stdout);
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("e2e: /api/sync resolves env per-request", () => {
  test("POST /api/sync?env=dev reads dev secrets, not startup env", () => {
    const { data, readEnvs } = results.queryParam;
    expect(data.success).toBe(true);
    expect(data.results[0].synced).toContain("OPENAI_API_KEY");
    expect(readEnvs).toContain("dev");
    expect(readEnvs).not.toContain("prod");
  });

  test("POST /api/sync with env in body reads that env", () => {
    const { data, readEnvs } = results.bodyEnv;
    expect(data.success).toBe(true);
    expect(data.results[0].synced).toContain("OPENAI_API_KEY");
    expect(readEnvs).toContain("dev");
  });

  test("POST /api/sync without env falls back to startup env", () => {
    const { data, readEnvs } = results.fallback;
    // Key only exists in dev, so the prod (startup env) read fails
    expect(data.success).toBe(false);
    expect(readEnvs).toContain("prod");
    expect(readEnvs).not.toContain("dev");
  });
});
