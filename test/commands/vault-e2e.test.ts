import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, chmodSync, existsSync } from "fs";
import { join } from "path";

// e2e: run the real CLI with a stub `op` binary on PATH and assert which
// vault is passed to the backend's `op item list` invocation.

const TMP = join(import.meta.dir, "__vault_e2e_fixtures__");
const STUB_DIR = join(TMP, "bin");
const PROJECT_DIR = join(TMP, "myapp");
const LOG_FILE = join(TMP, "op-calls.log");
const REPO_ROOT = join(import.meta.dir, "..", "..");

const OP_STUB = `#!/usr/bin/env bash
echo "$@" >> "$OP_STUB_LOG"
case "$*" in
  "account list --format=json") echo '[{"id":"stub-account"}]' ;;
  *) echo '[]' ;;
esac
`;

async function runCli(args: string[]): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", join(REPO_ROOT, "src", "index.ts"), ...args], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PATH: `${STUB_DIR}:${process.env.PATH}`,
      OP_STUB_LOG: LOG_FILE,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { stdout, exitCode };
}

function opCalls(): string[] {
  if (!existsSync(LOG_FILE)) return [];
  return readFileSync(LOG_FILE, "utf-8").trim().split("\n");
}

beforeEach(() => {
  mkdirSync(STUB_DIR, { recursive: true });
  mkdirSync(PROJECT_DIR, { recursive: true });
  const stubPath = join(STUB_DIR, "op");
  writeFileSync(stubPath, OP_STUB);
  chmodSync(stubPath, 0o755);
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("e2e: pull passes --vault through to the backend", () => {
  test("pull --vault custom-vault queries that vault", async () => {
    const { stdout, exitCode } = await runCli([
      "pull",
      "--vault",
      "custom-vault",
      PROJECT_DIR,
    ]);

    expect(exitCode).toBe(0);
    expect(opCalls()).toContain("item list --vault custom-vault --format json");
    expect(stdout).toContain("custom-vault");
  });

  test("pull without --vault defaults to shipkey vault", async () => {
    const { exitCode } = await runCli(["pull", PROJECT_DIR]);

    expect(exitCode).toBe(0);
    expect(opCalls()).toContain("item list --vault shipkey --format json");
  });
});

describe("e2e: list resolves vault from flag or shipkey.json", () => {
  test("list --vault custom-vault queries that vault", async () => {
    const { exitCode } = await runCli(["list", "--vault", "custom-vault", PROJECT_DIR]);

    expect(exitCode).toBe(0);
    expect(opCalls()).toContain("item list --vault custom-vault --format json");
  });

  test("list uses vault from shipkey.json when no flag given", async () => {
    writeFileSync(
      join(PROJECT_DIR, "shipkey.json"),
      JSON.stringify({ project: "myapp", vault: "team-secrets" }, null, 2)
    );

    const { exitCode } = await runCli(["list", PROJECT_DIR]);

    expect(exitCode).toBe(0);
    expect(opCalls()).toContain("item list --vault team-secrets --format json");
  });

  test("list --vault flag overrides shipkey.json vault", async () => {
    writeFileSync(
      join(PROJECT_DIR, "shipkey.json"),
      JSON.stringify({ project: "myapp", vault: "team-secrets" }, null, 2)
    );

    const { exitCode } = await runCli(["list", "--vault", "override-vault", PROJECT_DIR]);

    expect(exitCode).toBe(0);
    expect(opCalls()).toContain("item list --vault override-vault --format json");
  });
});
