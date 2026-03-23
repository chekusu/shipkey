import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { MockBackend } from "../helpers/mock-backend";
import { OnePasswordBackend } from "../../src/backends/onepassword";
import { BitwardenBackend } from "../../src/backends/bitwarden";
import { writeEnvFile, mergeEnvContent } from "../../src/env-writer";

describe("pull command logic", () => {
  test("backend.list and backend.read retrieves stored values", async () => {
    const backend = new MockBackend();
    backend.seed("OpenAI", "myapp", "dev", "OPENAI_API_KEY", "sk-123");
    backend.seed("Stripe", "myapp", "dev", "STRIPE_KEY", "sk_test_456");

    const refs = await backend.list("myapp", "dev");
    expect(refs).toHaveLength(2);

    for (const ref of refs) {
      const value = await backend.read(ref);
      expect(value).toBeTruthy();
    }
  });

  test("1Password backend buildInlineRef returns op:// URI for .envrc", () => {
    const backend = new OnePasswordBackend();
    const ref = {
      vault: "shipkey",
      provider: "OpenAI",
      project: "myapp",
      env: "prod",
      field: "OPENAI_API_KEY",
    };
    const inlineRef = backend.buildInlineRef(ref);
    expect(inlineRef).toBe("op://shipkey/OpenAI/myapp-prod/OPENAI_API_KEY");
  });

  test("Bitwarden backend buildInlineRef returns null (direct values)", () => {
    const backend = new BitwardenBackend();
    const ref = {
      vault: "shipkey",
      provider: "OpenAI",
      project: "myapp",
      env: "prod",
      field: "OPENAI_API_KEY",
    };
    expect(backend.buildInlineRef(ref)).toBeNull();
  });

  test("MockBackend list handles empty vault gracefully", async () => {
    const backend = new MockBackend();
    const refs = await backend.list("myapp", "dev");
    expect(refs).toHaveLength(0);
  });

  test("envrc line generation differs by backend type", () => {
    const ref = {
      vault: "shipkey",
      provider: "OpenAI",
      project: "myapp",
      env: "prod",
      field: "OPENAI_API_KEY",
    };

    const opBackend = new OnePasswordBackend();
    const opInlineRef = opBackend.buildInlineRef(ref);
    const opLine = `export OPENAI_API_KEY=$(op read "${opInlineRef}")`;
    expect(opLine).toContain("op read");
    expect(opLine).toContain("op://");

    const bwBackend = new BitwardenBackend();
    const bwInlineRef = bwBackend.buildInlineRef(ref);
    expect(bwInlineRef).toBeNull();
    // When null, pull.ts writes direct value: export KEY="value"
  });
});

describe("pull writes env file via writeEnvFile", () => {
  const TMP = join(import.meta.dir, "__pull_env_fixtures__");

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  test("pull writes pulled keys to .env via writeEnvFile", async () => {
    // Simulate what pull.ts does: build envVars map from entries, then call writeEnvFile
    const backend = new MockBackend();
    backend.seed("OpenAI", "myapp", "dev", "OPENAI_API_KEY", "sk-123");
    backend.seed("Stripe", "myapp", "dev", "STRIPE_KEY", "sk_test_456");

    const refs = await backend.list("myapp", "dev");
    const envVars: Record<string, string> = {};
    for (const ref of refs) {
      const value = await backend.read(ref);
      envVars[ref.field] = value;
    }

    const envFile = await writeEnvFile(TMP, envVars);
    expect(envFile).toBe(".env");
    expect(existsSync(join(TMP, ".env"))).toBe(true);

    const content = readFileSync(join(TMP, ".env"), "utf-8");
    expect(content).toContain("OPENAI_API_KEY=sk-123");
    expect(content).toContain("STRIPE_KEY=sk_test_456");
  });

  test("pull writeEnvFile merges with existing .env content", async () => {
    // Pre-existing .env with a manual key
    writeFileSync(join(TMP, ".env"), "MANUAL_KEY=manual_value\nOLD_KEY=old\n");

    const envVars: Record<string, string> = {
      OLD_KEY: "new_value",
      FRESH_KEY: "fresh",
    };

    await writeEnvFile(TMP, envVars);
    const content = readFileSync(join(TMP, ".env"), "utf-8");

    // Existing unmanaged key preserved
    expect(content).toContain("MANUAL_KEY=manual_value");
    // Existing key updated in-place
    expect(content).toContain("OLD_KEY=new_value");
    expect(content).not.toContain("OLD_KEY=old");
    // New key appended
    expect(content).toContain("FRESH_KEY=fresh");
  });

  test("pull writeEnvFile targets .dev.vars when wrangler.toml exists", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'my-worker'\n");

    const envVars = { API_SECRET: "secret123" };
    const envFile = await writeEnvFile(TMP, envVars);

    expect(envFile).toBe(".dev.vars");
    const content = readFileSync(join(TMP, ".dev.vars"), "utf-8");
    expect(content).toContain("API_SECRET=secret123");
  });
});

describe("pull .dev.vars merge behavior (via mergeEnvContent)", () => {
  test("updates existing keys in-place", () => {
    const existing =
      "# Auto-generated by shipkey\nDB_URL=old_db\nAPI_KEY=old_api\n";
    const envVars = { API_KEY: "new_api", NEW_SECRET: "secret123" };
    const content = mergeEnvContent(existing, envVars);

    // Comment preserved
    expect(content).toContain("# Auto-generated by shipkey");
    // Existing key updated in-place
    expect(content).toContain("API_KEY=new_api");
    expect(content).not.toContain("API_KEY=old_api");
    // Untouched key preserved
    expect(content).toContain("DB_URL=old_db");
    // New key appended
    expect(content).toContain("NEW_SECRET=secret123");

    // Verify ordering: DB_URL still before API_KEY (in-place update)
    const kvLines = content
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"));
    const dbIdx = kvLines.findIndex((l) => l.startsWith("DB_URL="));
    const apiIdx = kvLines.findIndex((l) => l.startsWith("API_KEY="));
    expect(dbIdx).toBeLessThan(apiIdx);
  });

  test("creates content with new keys when empty", () => {
    const header = [
      "# Auto-generated by shipkey — do not edit manually",
      "# Project: myapp  Environment: dev",
      "",
    ].join("\n");
    const content = mergeEnvContent(header, { SECRET: "val" });

    expect(content).toContain("# Auto-generated by shipkey");
    expect(content).toContain("SECRET=val");
  });

  test("does not duplicate keys on repeated merges", () => {
    const existing = "# Header\nKEY_A=val1\n";
    const envVars = { KEY_A: "val1_updated", KEY_B: "val2" };
    const content = mergeEnvContent(existing, envVars);

    // KEY_A should appear exactly once (updated, not duplicated)
    const keyAMatches = content
      .split("\n")
      .filter((l) => l.startsWith("KEY_A="));
    expect(keyAMatches).toHaveLength(1);
    expect(keyAMatches[0]).toBe("KEY_A=val1_updated");

    // KEY_B appended
    expect(content).toContain("KEY_B=val2");
  });
});

describe("e2e: multi-line values through full pull pipeline", () => {
  const TMP = join(import.meta.dir, "__pull_multiline_fixtures__");

  const PEM_KEY = [
    "-----BEGIN RSA PRIVATE KEY-----",
    "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7",
    "kGWgYS/VBbwQKlGZ7mXsS5JLkf6gH+t5XjKFGdJRvCZFm/VEbLj",
    "-----END RSA PRIVATE KEY-----",
  ].join("\n");

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  test("PEM key from backend is written correctly to .env", async () => {
    const backend = new MockBackend();
    backend.seed("GitHub", "myapp", "prod", "GITHUB_APP_PRIVATE_KEY", PEM_KEY);
    backend.seed("OpenAI", "myapp", "prod", "OPENAI_API_KEY", "sk-test-123");

    // Simulate pull: read from backend, write to env
    const refs = await backend.list("myapp", "prod");
    const envVars: Record<string, string> = {};
    for (const ref of refs) {
      envVars[ref.field] = await backend.read(ref);
    }

    await writeEnvFile(TMP, envVars);

    const content = readFileSync(join(TMP, ".env"), "utf-8");

    // PEM key should be on a single line, properly escaped
    const pemLine = content
      .split("\n")
      .find((l) => l.startsWith("GITHUB_APP_PRIVATE_KEY="));
    expect(pemLine).toBeDefined();
    expect(pemLine!).toContain("\\n"); // escaped newlines
    expect(pemLine!).toContain("BEGIN RSA PRIVATE KEY");
    expect(pemLine!).toContain("END RSA PRIVATE KEY");

    // No orphan PEM body lines
    expect(
      content.split("\n").filter((l) => l.startsWith("MIIEvQIBADANBg"))
    ).toHaveLength(0);

    // Other keys intact
    expect(content).toContain("OPENAI_API_KEY=sk-test-123");
  });

  test("repeated pulls with PEM key do not corrupt file", async () => {
    const backend = new MockBackend();
    backend.seed("GitHub", "myapp", "prod", "GITHUB_APP_PRIVATE_KEY", PEM_KEY);
    backend.seed("OpenAI", "myapp", "prod", "OPENAI_API_KEY", "sk-test-123");

    // First pull
    const refs = await backend.list("myapp", "prod");
    const envVars: Record<string, string> = {};
    for (const ref of refs) {
      envVars[ref.field] = await backend.read(ref);
    }
    await writeEnvFile(TMP, envVars);

    // Second pull (same keys, updated PEM)
    const updatedPEM = PEM_KEY.replace("MIIEvQIBADANBg", "UPDATED_KEY_DATA");
    const envVars2: Record<string, string> = {
      GITHUB_APP_PRIVATE_KEY: updatedPEM,
      OPENAI_API_KEY: "sk-test-456",
    };
    await writeEnvFile(TMP, envVars2);

    const content = readFileSync(join(TMP, ".env"), "utf-8");

    // Only one PEM key line
    const pemLines = content
      .split("\n")
      .filter((l) => l.startsWith("GITHUB_APP_PRIVATE_KEY="));
    expect(pemLines).toHaveLength(1);

    // Updated content
    expect(pemLines[0]).toContain("UPDATED_KEY_DATA");
    expect(pemLines[0]).not.toContain("MIIEvQIBADANBg");

    // Other key updated
    expect(content).toContain("OPENAI_API_KEY=sk-test-456");
    expect(content).not.toContain("sk-test-123");
  });

  test("pull recovers from previously corrupted multi-line value", async () => {
    // Simulate a file corrupted by a previous buggy write
    writeFileSync(
      join(TMP, ".env"),
      [
        "CLERK_KEY=pk_live_abc123",
        "GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----",
        "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7",
        "kGWgYS/VBbwQKlGZ7mXsS5JLkf6gH+t5XjKFGdJRvCZFm/VEbLj",
        "-----END RSA PRIVATE KEY-----",
        "OPENAI_API_KEY=sk-old",
        "",
      ].join("\n")
    );

    // Pull with new values
    const backend = new MockBackend();
    backend.seed("GitHub", "myapp", "prod", "GITHUB_APP_PRIVATE_KEY", PEM_KEY);
    backend.seed("OpenAI", "myapp", "prod", "OPENAI_API_KEY", "sk-new");

    const refs = await backend.list("myapp", "prod");
    const envVars: Record<string, string> = {};
    for (const ref of refs) {
      envVars[ref.field] = await backend.read(ref);
    }
    await writeEnvFile(TMP, envVars);

    const content = readFileSync(join(TMP, ".env"), "utf-8");

    // Corrupted orphan lines gone
    expect(
      content.split("\n").filter((l) => l.trim() === "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7")
    ).toHaveLength(0);
    expect(
      content.split("\n").filter((l) => l.trim() === "-----END RSA PRIVATE KEY-----")
    ).toHaveLength(0);

    // PEM properly escaped on one line
    const pemLines = content
      .split("\n")
      .filter((l) => l.startsWith("GITHUB_APP_PRIVATE_KEY="));
    expect(pemLines).toHaveLength(1);
    expect(pemLines[0]).toContain("\\n");

    // Other keys correct
    expect(content).toContain("CLERK_KEY=pk_live_abc123");
    expect(content).toContain("OPENAI_API_KEY=sk-new");
    expect(content).not.toContain("sk-old");
  });

  test("PEM key written to .dev.vars via mergeEnvContent", () => {
    const existing = [
      "# Auto-generated by shipkey",
      "CLERK_KEY=pk_live_abc",
      "",
    ].join("\n");

    const envVars = {
      GITHUB_APP_PRIVATE_KEY: PEM_KEY,
      NEW_KEY: "value",
    };

    const content = mergeEnvContent(existing, envVars);

    // PEM escaped on one line
    const pemLines = content
      .split("\n")
      .filter((l) => l.startsWith("GITHUB_APP_PRIVATE_KEY="));
    expect(pemLines).toHaveLength(1);
    expect(pemLines[0]).toContain("\\n");

    // Existing keys preserved
    expect(content).toContain("CLERK_KEY=pk_live_abc");
    expect(content).toContain("# Auto-generated by shipkey");
    expect(content).toContain("NEW_KEY=value");
  });

  test("pull with env=dev writes to .env.development.local", async () => {
    const backend = new MockBackend();
    backend.seed("OpenAI", "myapp", "dev", "OPENAI_API_KEY", "sk-dev-123");

    const refs = await backend.list("myapp", "dev");
    const envVars: Record<string, string> = {};
    for (const ref of refs) {
      envVars[ref.field] = await backend.read(ref);
    }

    const envFile = await writeEnvFile(TMP, envVars, "dev");
    expect(envFile).toBe(".env.development.local");
    const content = readFileSync(join(TMP, ".env.development.local"), "utf-8");
    expect(content).toContain("OPENAI_API_KEY=sk-dev-123");
  });

  test("pull with env=prod writes to .env.production.local", async () => {
    const backend = new MockBackend();
    backend.seed("OpenAI", "myapp", "prod", "OPENAI_API_KEY", "sk-prod-456");

    const refs = await backend.list("myapp", "prod");
    const envVars: Record<string, string> = {};
    for (const ref of refs) {
      envVars[ref.field] = await backend.read(ref);
    }

    const envFile = await writeEnvFile(TMP, envVars, "prod");
    expect(envFile).toBe(".env.production.local");
    const content = readFileSync(join(TMP, ".env.production.local"), "utf-8");
    expect(content).toContain("OPENAI_API_KEY=sk-prod-456");
  });

  test("pull with env=dev + Cloudflare writes to .dev.vars", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'worker'\n");
    const envFile = await writeEnvFile(TMP, { SECRET: "dev_val" }, "dev");
    expect(envFile).toBe(".dev.vars");
  });

  test("pull with env=prod + Cloudflare writes to .dev.vars.production", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'worker'\n");
    const envFile = await writeEnvFile(TMP, { SECRET: "prod_val" }, "prod");
    expect(envFile).toBe(".dev.vars.production");
    const content = readFileSync(join(TMP, ".dev.vars.production"), "utf-8");
    expect(content).toContain("SECRET=prod_val");
  });

  test("pull dev and prod create separate files, no cross-contamination", async () => {
    const backend = new MockBackend();
    backend.seed("OpenAI", "myapp", "dev", "OPENAI_API_KEY", "sk-dev");
    backend.seed("OpenAI", "myapp", "prod", "OPENAI_API_KEY", "sk-prod");

    // Pull dev
    const devRefs = await backend.list("myapp", "dev");
    const devVars: Record<string, string> = {};
    for (const ref of devRefs) devVars[ref.field] = await backend.read(ref);
    await writeEnvFile(TMP, devVars, "dev");

    // Pull prod
    const prodRefs = await backend.list("myapp", "prod");
    const prodVars: Record<string, string> = {};
    for (const ref of prodRefs) prodVars[ref.field] = await backend.read(ref);
    await writeEnvFile(TMP, prodVars, "prod");

    const devContent = readFileSync(join(TMP, ".env.development.local"), "utf-8");
    const prodContent = readFileSync(join(TMP, ".env.production.local"), "utf-8");

    expect(devContent).toContain("OPENAI_API_KEY=sk-dev");
    expect(devContent).not.toContain("sk-prod");
    expect(prodContent).toContain("OPENAI_API_KEY=sk-prod");
    expect(prodContent).not.toContain("sk-dev");
  });

  test("pull without env param writes to .env (backward compat)", async () => {
    const backend = new MockBackend();
    backend.seed("OpenAI", "myapp", "prod", "OPENAI_API_KEY", "sk-123");

    const refs = await backend.list("myapp", "prod");
    const envVars: Record<string, string> = {};
    for (const ref of refs) envVars[ref.field] = await backend.read(ref);

    // No env param — backward compat
    const envFile = await writeEnvFile(TMP, envVars);
    expect(envFile).toBe(".env");
  });

  test("push then pull round-trip preserves multi-line values", async () => {
    const backend = new MockBackend();

    // Push: store PEM in backend
    await backend.write({
      ref: {
        vault: "shipkey",
        provider: "GitHub",
        project: "myapp",
        env: "prod",
        field: "GITHUB_APP_PRIVATE_KEY",
      },
      value: PEM_KEY,
    });

    // Pull: read from backend, write to env
    const refs = await backend.list("myapp", "prod");
    expect(refs).toHaveLength(1);

    const envVars: Record<string, string> = {};
    for (const ref of refs) {
      envVars[ref.field] = await backend.read(ref);
    }
    await writeEnvFile(TMP, envVars);

    const content = readFileSync(join(TMP, ".env"), "utf-8");

    // Value on one line, properly escaped
    const pemLine = content
      .split("\n")
      .find((l) => l.startsWith("GITHUB_APP_PRIVATE_KEY="));
    expect(pemLine).toBeDefined();

    // Extract value and verify round-trip
    const rawValue = pemLine!.slice("GITHUB_APP_PRIVATE_KEY=".length);
    // Unescape: strip quotes, then unescape sequences
    const unquoted = rawValue.startsWith('"')
      ? rawValue.slice(1, -1)
      : rawValue;
    const restored = unquoted
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
    expect(restored).toBe(PEM_KEY);
  });
});
