import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { detectEnvFile, writeEnvFile, formatEnvValue, mergeEnvContent } from "../src/env-writer";

const TMP = join(import.meta.dir, "__env_writer_fixtures__");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("detectEnvFile", () => {
  test("returns .dev.vars when wrangler.toml exists", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'my-worker'\n");
    const result = await detectEnvFile(TMP);
    expect(result).toBe(".dev.vars");
  });

  test("returns .env when .env exists (no wrangler.toml)", async () => {
    writeFileSync(join(TMP, ".env"), "FOO=bar\n");
    const result = await detectEnvFile(TMP);
    expect(result).toBe(".env");
  });

  test("returns .env.local when only .env.local exists", async () => {
    writeFileSync(join(TMP, ".env.local"), "FOO=bar\n");
    const result = await detectEnvFile(TMP);
    expect(result).toBe(".env.local");
  });

  test("returns .env when nothing exists (default)", async () => {
    const result = await detectEnvFile(TMP);
    expect(result).toBe(".env");
  });

  test("prefers .dev.vars over .env when wrangler.toml exists", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'my-worker'\n");
    writeFileSync(join(TMP, ".env"), "FOO=bar\n");
    const result = await detectEnvFile(TMP);
    expect(result).toBe(".dev.vars");
  });

  // --- Multi-environment tests (env parameter) ---

  test("env=dev + Cloudflare → .dev.vars", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'worker'\n");
    expect(await detectEnvFile(TMP, "dev")).toBe(".dev.vars");
  });

  test("env=prod + Cloudflare → .dev.vars.production", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'worker'\n");
    expect(await detectEnvFile(TMP, "prod")).toBe(".dev.vars.production");
  });

  test("env=staging + Cloudflare → .dev.vars.staging", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'worker'\n");
    expect(await detectEnvFile(TMP, "staging")).toBe(".dev.vars.staging");
  });

  test("env=dev + regular project → .env.development.local", async () => {
    expect(await detectEnvFile(TMP, "dev")).toBe(".env.development.local");
  });

  test("env=prod + regular project → .env.production.local", async () => {
    expect(await detectEnvFile(TMP, "prod")).toBe(".env.production.local");
  });

  test("env=staging + regular project → .env.staging.local", async () => {
    expect(await detectEnvFile(TMP, "staging")).toBe(".env.staging.local");
  });

  test("env=dev + regular project ignores existing .env", async () => {
    writeFileSync(join(TMP, ".env"), "FOO=bar\n");
    expect(await detectEnvFile(TMP, "dev")).toBe(".env.development.local");
  });

  test("env=prod + regular project ignores existing .env.local", async () => {
    writeFileSync(join(TMP, ".env.local"), "FOO=bar\n");
    expect(await detectEnvFile(TMP, "prod")).toBe(".env.production.local");
  });

  // --- Backward compatibility (no env parameter) ---

  test("no env + Cloudflare → .dev.vars (backward compat)", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'worker'\n");
    expect(await detectEnvFile(TMP)).toBe(".dev.vars");
  });

  test("no env + existing .env → .env (backward compat)", async () => {
    writeFileSync(join(TMP, ".env"), "FOO=bar\n");
    expect(await detectEnvFile(TMP)).toBe(".env");
  });

  test("no env + existing .env.local → .env.local (backward compat)", async () => {
    writeFileSync(join(TMP, ".env.local"), "FOO=bar\n");
    expect(await detectEnvFile(TMP)).toBe(".env.local");
  });

  test("no env + empty dir → .env (backward compat)", async () => {
    expect(await detectEnvFile(TMP)).toBe(".env");
  });
});

describe("writeEnvFile", () => {
  test("merges into existing .env without losing fields", async () => {
    writeFileSync(join(TMP, ".env"), "EXISTING_KEY=existing_value\n");
    await writeEnvFile(TMP, { NEW_KEY: "new_value" });
    const content = readFileSync(join(TMP, ".env"), "utf-8");
    expect(content).toContain("EXISTING_KEY=existing_value");
    expect(content).toContain("NEW_KEY=new_value");
  });

  test("updates existing keys in-place", async () => {
    writeFileSync(
      join(TMP, ".env"),
      "FIRST=1\nUPDATE_ME=old_value\nLAST=3\n"
    );
    await writeEnvFile(TMP, { UPDATE_ME: "new_value" });
    const content = readFileSync(join(TMP, ".env"), "utf-8");
    expect(content).toContain("UPDATE_ME=new_value");
    expect(content).not.toContain("old_value");
    // Verify in-place: UPDATE_ME should still be between FIRST and LAST
    const lines = content.split("\n").filter((l) => l.trim() !== "");
    const firstIdx = lines.findIndex((l) => l.startsWith("FIRST="));
    const updateIdx = lines.findIndex((l) => l.startsWith("UPDATE_ME="));
    const lastIdx = lines.findIndex((l) => l.startsWith("LAST="));
    expect(updateIdx).toBeGreaterThan(firstIdx);
    expect(updateIdx).toBeLessThan(lastIdx);
  });

  test("creates .env if no env file exists", async () => {
    const filename = await writeEnvFile(TMP, { MY_KEY: "my_value" });
    expect(filename).toBe(".env");
    expect(existsSync(join(TMP, ".env"))).toBe(true);
    const content = readFileSync(join(TMP, ".env"), "utf-8");
    expect(content).toContain("MY_KEY=my_value");
  });

  test("writes to .dev.vars when wrangler.toml exists", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'my-worker'\n");
    const filename = await writeEnvFile(TMP, { SECRET: "abc123" });
    expect(filename).toBe(".dev.vars");
    expect(existsSync(join(TMP, ".dev.vars"))).toBe(true);
    const content = readFileSync(join(TMP, ".dev.vars"), "utf-8");
    expect(content).toContain("SECRET=abc123");
  });

  test("preserves comments and blank lines", async () => {
    writeFileSync(
      join(TMP, ".env"),
      "# This is a comment\n\nFOO=bar\n\n# Another comment\nBAZ=qux\n"
    );
    await writeEnvFile(TMP, { NEW_VAR: "hello" });
    const content = readFileSync(join(TMP, ".env"), "utf-8");
    expect(content).toContain("# This is a comment");
    expect(content).toContain("# Another comment");
    expect(content).toContain("FOO=bar");
    expect(content).toContain("BAZ=qux");
    expect(content).toContain("NEW_VAR=hello");
    // Verify blank lines are preserved
    const lines = content.split("\n");
    const blankCount = lines.filter((l) => l === "").length;
    // Original had 2 blank lines + trailing newline; at least 2 blank lines should remain
    expect(blankCount).toBeGreaterThanOrEqual(2);
  });

  test("returns the file name that was written to", async () => {
    const filename = await writeEnvFile(TMP, { KEY: "val" });
    expect(filename).toBe(".env");

    // Also test with wrangler
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'worker'\n");
    const filename2 = await writeEnvFile(TMP, { KEY2: "val2" });
    expect(filename2).toBe(".dev.vars");
  });
});

describe("writeEnvFile — multi-environment", () => {
  test("env=dev writes to .env.development.local for regular project", async () => {
    const filename = await writeEnvFile(TMP, { KEY: "dev_val" }, "dev");
    expect(filename).toBe(".env.development.local");
    expect(existsSync(join(TMP, ".env.development.local"))).toBe(true);
    const content = readFileSync(join(TMP, ".env.development.local"), "utf-8");
    expect(content).toContain("KEY=dev_val");
  });

  test("env=prod writes to .env.production.local for regular project", async () => {
    const filename = await writeEnvFile(TMP, { KEY: "prod_val" }, "prod");
    expect(filename).toBe(".env.production.local");
    expect(existsSync(join(TMP, ".env.production.local"))).toBe(true);
    const content = readFileSync(join(TMP, ".env.production.local"), "utf-8");
    expect(content).toContain("KEY=prod_val");
  });

  test("env=dev writes to .dev.vars for Cloudflare project", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'worker'\n");
    const filename = await writeEnvFile(TMP, { SECRET: "dev123" }, "dev");
    expect(filename).toBe(".dev.vars");
    const content = readFileSync(join(TMP, ".dev.vars"), "utf-8");
    expect(content).toContain("SECRET=dev123");
  });

  test("env=prod writes to .dev.vars.production for Cloudflare project", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'worker'\n");
    const filename = await writeEnvFile(TMP, { SECRET: "prod123" }, "prod");
    expect(filename).toBe(".dev.vars.production");
    const content = readFileSync(join(TMP, ".dev.vars.production"), "utf-8");
    expect(content).toContain("SECRET=prod123");
  });

  test("dev and prod write to separate files (no cross-contamination)", async () => {
    await writeEnvFile(TMP, { API_KEY: "dev_key", DEV_ONLY: "yes" }, "dev");
    await writeEnvFile(TMP, { API_KEY: "prod_key", PROD_ONLY: "yes" }, "prod");

    const devContent = readFileSync(join(TMP, ".env.development.local"), "utf-8");
    const prodContent = readFileSync(join(TMP, ".env.production.local"), "utf-8");

    // Dev file has dev values only
    expect(devContent).toContain("API_KEY=dev_key");
    expect(devContent).toContain("DEV_ONLY=yes");
    expect(devContent).not.toContain("prod_key");
    expect(devContent).not.toContain("PROD_ONLY");

    // Prod file has prod values only
    expect(prodContent).toContain("API_KEY=prod_key");
    expect(prodContent).toContain("PROD_ONLY=yes");
    expect(prodContent).not.toContain("dev_key");
    expect(prodContent).not.toContain("DEV_ONLY");
  });

  test("Cloudflare dev and prod write to separate files", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'worker'\n");
    await writeEnvFile(TMP, { TOKEN: "dev_tok" }, "dev");
    await writeEnvFile(TMP, { TOKEN: "prod_tok" }, "prod");

    const devContent = readFileSync(join(TMP, ".dev.vars"), "utf-8");
    const prodContent = readFileSync(join(TMP, ".dev.vars.production"), "utf-8");

    expect(devContent).toContain("TOKEN=dev_tok");
    expect(devContent).not.toContain("prod_tok");
    expect(prodContent).toContain("TOKEN=prod_tok");
    expect(prodContent).not.toContain("dev_tok");
  });

  test("env-specific write merges with existing env-specific file", async () => {
    writeFileSync(join(TMP, ".env.development.local"), "EXISTING=keep_me\n");
    await writeEnvFile(TMP, { NEW_KEY: "added" }, "dev");

    const content = readFileSync(join(TMP, ".env.development.local"), "utf-8");
    expect(content).toContain("EXISTING=keep_me");
    expect(content).toContain("NEW_KEY=added");
  });

  test("env-specific write does not touch unrelated env files", async () => {
    writeFileSync(join(TMP, ".env"), "BASE=val\n");
    writeFileSync(join(TMP, ".env.local"), "LOCAL=val\n");
    await writeEnvFile(TMP, { SECRET: "s" }, "prod");

    // Original files untouched
    expect(readFileSync(join(TMP, ".env"), "utf-8")).toBe("BASE=val\n");
    expect(readFileSync(join(TMP, ".env.local"), "utf-8")).toBe("LOCAL=val\n");
    // New file created
    expect(existsSync(join(TMP, ".env.production.local"))).toBe(true);
  });

  test("no env param still writes to .env (backward compat)", async () => {
    const filename = await writeEnvFile(TMP, { KEY: "val" });
    expect(filename).toBe(".env");
    expect(existsSync(join(TMP, ".env"))).toBe(true);
  });

  test("no env param with wrangler.toml still writes to .dev.vars (backward compat)", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'worker'\n");
    const filename = await writeEnvFile(TMP, { KEY: "val" });
    expect(filename).toBe(".dev.vars");
  });

  test("no env param with existing .env.local writes to .env.local (backward compat)", async () => {
    writeFileSync(join(TMP, ".env.local"), "OLD=val\n");
    const filename = await writeEnvFile(TMP, { NEW: "val" });
    expect(filename).toBe(".env.local");
    const content = readFileSync(join(TMP, ".env.local"), "utf-8");
    expect(content).toContain("OLD=val");
    expect(content).toContain("NEW=val");
  });

  test("repeated env-specific writes update in-place, no duplication", async () => {
    await writeEnvFile(TMP, { KEY: "v1" }, "dev");
    await writeEnvFile(TMP, { KEY: "v2" }, "dev");

    const content = readFileSync(join(TMP, ".env.development.local"), "utf-8");
    const matches = content.match(/KEY=/g);
    expect(matches).toHaveLength(1);
    expect(content).toContain("KEY=v2");
    expect(content).not.toContain("KEY=v1");
  });
});

describe("formatEnvValue", () => {
  test("returns simple values unchanged", () => {
    expect(formatEnvValue("sk-test-123")).toBe("sk-test-123");
    expect(formatEnvValue("postgres://localhost:5432/db")).toBe(
      "postgres://localhost:5432/db"
    );
  });

  test("wraps multi-line values in double quotes with escaped newlines", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEvQIBADANBg\nkGWgYS/VBbwQ==\n-----END RSA PRIVATE KEY-----";
    const result = formatEnvValue(pem);
    expect(result).toStartWith('"');
    expect(result).toEndWith('"');
    expect(result).toContain("\\n");
    expect(result).not.toContain("\n"); // no literal newlines
    // Round-trip: unescaping should recover original
    const unescaped = result
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
    expect(unescaped).toBe(pem);
  });

  test("escapes internal double quotes", () => {
    const value = 'value with "quotes"\nand newlines';
    const result = formatEnvValue(value);
    expect(result).toBe('"value with \\"quotes\\"\\nand newlines"');
  });

  test("quotes values with leading/trailing whitespace", () => {
    expect(formatEnvValue("  spaced  ")).toBe('"  spaced  "');
  });

  test("quotes values with inline hash", () => {
    expect(formatEnvValue("value#comment")).toBe('"value#comment"');
  });
});

describe("writeEnvFile — multi-line values", () => {
  test("writes multi-line values as escaped single-line strings", async () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END RSA PRIVATE KEY-----";
    await writeEnvFile(TMP, { PRIVATE_KEY: pem });
    const content = readFileSync(join(TMP, ".env"), "utf-8");
    // Should be a single line with escaped newlines
    const keyLines = content.split("\n").filter((l) => l.startsWith("PRIVATE_KEY="));
    expect(keyLines).toHaveLength(1);
    expect(keyLines[0]).toContain("\\n");
    expect(keyLines[0]).toContain("BEGIN RSA PRIVATE KEY");
    expect(keyLines[0]).toContain("END RSA PRIVATE KEY");
  });

  test("updates corrupted multi-line PEM key to properly escaped format", async () => {
    // Simulate a corrupted file from a previous buggy write
    writeFileSync(
      join(TMP, ".env"),
      [
        "SOME_KEY=value1",
        "GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----",
        "MIIEvQIBADANBg",
        "kGWgYS/VBbwQ==",
        "-----END RSA PRIVATE KEY-----",
        "OTHER_KEY=value2",
        "",
      ].join("\n")
    );

    const newPem =
      "-----BEGIN RSA PRIVATE KEY-----\nNEWKEYDATA\n-----END RSA PRIVATE KEY-----";
    await writeEnvFile(TMP, { GITHUB_APP_PRIVATE_KEY: newPem });

    const content = readFileSync(join(TMP, ".env"), "utf-8");
    // Corrupted orphan lines should be gone
    expect(content).not.toContain("MIIEvQIBADANBg");
    expect(content).not.toContain("kGWgYS/VBbwQ==");
    // New key should be properly escaped on one line
    const keyLines = content
      .split("\n")
      .filter((l) => l.startsWith("GITHUB_APP_PRIVATE_KEY="));
    expect(keyLines).toHaveLength(1);
    expect(keyLines[0]).toContain("\\n");
    // Other keys preserved
    expect(content).toContain("SOME_KEY=value1");
    expect(content).toContain("OTHER_KEY=value2");
  });

  test("handles properly quoted multi-line values in existing file", async () => {
    // Existing file with a properly quoted multi-line value
    writeFileSync(
      join(TMP, ".env"),
      'PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\nOLDDATA\\n-----END RSA PRIVATE KEY-----"\nOTHER=val\n'
    );

    const newPem =
      "-----BEGIN RSA PRIVATE KEY-----\nNEWDATA\n-----END RSA PRIVATE KEY-----";
    await writeEnvFile(TMP, { PRIVATE_KEY: newPem });

    const content = readFileSync(join(TMP, ".env"), "utf-8");
    const keyLines = content
      .split("\n")
      .filter((l) => l.startsWith("PRIVATE_KEY="));
    expect(keyLines).toHaveLength(1);
    expect(keyLines[0]).toContain("NEWDATA");
    expect(keyLines[0]).not.toContain("OLDDATA");
    expect(content).toContain("OTHER=val");
  });

  test("multiple pulls with multi-line values don't corrupt file", async () => {
    const pem1 =
      "-----BEGIN PRIVATE KEY-----\nKEY1DATA\n-----END PRIVATE KEY-----";
    const pem2 =
      "-----BEGIN PRIVATE KEY-----\nKEY2DATA\n-----END PRIVATE KEY-----";

    await writeEnvFile(TMP, { PRIVATE_KEY: pem1, OTHER: "val1" });
    await writeEnvFile(TMP, { PRIVATE_KEY: pem2 });

    const content = readFileSync(join(TMP, ".env"), "utf-8");
    const keyLines = content
      .split("\n")
      .filter((l) => l.startsWith("PRIVATE_KEY="));
    expect(keyLines).toHaveLength(1);
    expect(keyLines[0]).toContain("KEY2DATA");
    expect(keyLines[0]).not.toContain("KEY1DATA");
    expect(content).toContain("OTHER=val1");
  });
});

describe("formatEnvValue — edge cases", () => {
  test("escapes carriage returns", () => {
    const value = "line1\r\nline2";
    const result = formatEnvValue(value);
    expect(result).toBe('"line1\\r\\nline2"');
  });

  test("returns empty string unchanged", () => {
    expect(formatEnvValue("")).toBe("");
  });

  test("value with backslashes but no newlines is not quoted", () => {
    expect(formatEnvValue("C:\\path\\to\\file")).toBe("C:\\path\\to\\file");
  });

  test("value with backslashes AND newlines escapes both", () => {
    const value = "path\\to\nfile";
    const result = formatEnvValue(value);
    expect(result).toBe('"path\\\\to\\nfile"');
    // Round-trip
    const restored = result
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\");
    expect(restored).toBe(value);
  });
});

describe("mergeEnvContent", () => {
  test("handles empty existing content", () => {
    const result = mergeEnvContent("", { KEY: "value" });
    expect(result).toBe("KEY=value\n");
  });

  test("preserves file structure while merging", () => {
    const existing = "# Header\n\nFOO=bar\nBAZ=qux\n";
    const result = mergeEnvContent(existing, { FOO: "updated", NEW: "val" });
    expect(result).toContain("# Header");
    expect(result).toContain("FOO=updated");
    expect(result).toContain("BAZ=qux");
    expect(result).toContain("NEW=val");
    expect(result).not.toContain("FOO=bar");
  });

  test("handles literal multi-line quoted values in existing file", () => {
    // Existing file with a value using literal newlines inside double quotes
    const existing = [
      'PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----',
      "MIIEvQIBADANBg",
      '-----END RSA PRIVATE KEY-----"',
      "OTHER=val",
      "",
    ].join("\n");

    const newPem =
      "-----BEGIN RSA PRIVATE KEY-----\nNEWDATA\n-----END RSA PRIVATE KEY-----";
    const content = mergeEnvContent(existing, { PRIVATE_KEY: newPem });

    // Multi-line quoted value should be replaced as a whole
    const pemLines = content
      .split("\n")
      .filter((l) => l.startsWith("PRIVATE_KEY="));
    expect(pemLines).toHaveLength(1);
    expect(pemLines[0]).toContain("NEWDATA");
    // Orphan body lines from the old quoted value should be gone
    expect(content).not.toContain("MIIEvQIBADANBg");
    // Other keys preserved
    expect(content).toContain("OTHER=val");
  });

  test("handles values containing equals signs (base64)", () => {
    const existing = "SECRET=abc123==\nOTHER=val\n";
    const content = mergeEnvContent(existing, { SECRET: "xyz789==" });
    expect(content).toContain("SECRET=xyz789==");
    expect(content).not.toContain("abc123==");
    expect(content).toContain("OTHER=val");
  });

  test("handles orphan lines at file start (no preceding kv)", () => {
    // A garbage line before any valid key-value
    const existing = "some random text\nKEY=value\n";
    const content = mergeEnvContent(existing, { KEY: "updated" });
    expect(content).toContain("some random text");
    expect(content).toContain("KEY=updated");
    expect(content).not.toContain("KEY=value");
  });

  test("handles duplicate keys in existing file (updates first occurrence)", () => {
    const existing = "KEY=first\nOTHER=middle\nKEY=second\n";
    const content = mergeEnvContent(existing, { KEY: "new" });

    const keyLines = content.split("\n").filter((l) => l.startsWith("KEY="));
    // Both occurrences should be updated (same key matched twice)
    expect(keyLines.length).toBeGreaterThanOrEqual(1);
    for (const line of keyLines) {
      expect(line).toBe("KEY=new");
    }
    expect(content).toContain("OTHER=middle");
  });
});

describe("integration: pull + existing .env", () => {
  test("full pull scenario: existing .env preserved, new keys merged, updated keys changed", async () => {
    writeFileSync(
      join(TMP, ".env"),
      [
        "DATABASE_URL=postgres://localhost:5432/mydb",
        "REDIS_URL=redis://localhost:6379",
        "EXISTING_SECRET=should-not-be-lost",
        "",
      ].join("\n")
    );

    // Simulate pull: 2 new keys + 1 existing key updated
    const pulled = {
      COINBASE_API_KEY: "test-key-123",
      COINBASE_API_SECRET: "test-secret-456",
      REDIS_URL: "redis://new-host:6379",
    };

    const file = await writeEnvFile(TMP, pulled);
    expect(file).toBe(".env");

    const content = readFileSync(join(TMP, ".env"), "utf-8");
    // Existing untouched key preserved
    expect(content).toContain("DATABASE_URL=postgres://localhost:5432/mydb");
    expect(content).toContain("EXISTING_SECRET=should-not-be-lost");
    // Updated key
    expect(content).toContain("REDIS_URL=redis://new-host:6379");
    expect(content).not.toContain("redis://localhost:6379");
    // New keys appended
    expect(content).toContain("COINBASE_API_KEY=test-key-123");
    expect(content).toContain("COINBASE_API_SECRET=test-secret-456");
  });

  test("multiple pulls don't duplicate keys", async () => {
    writeFileSync(join(TMP, ".env"), "DB=postgres\n");

    await writeEnvFile(TMP, { API_KEY: "v1" });
    await writeEnvFile(TMP, { API_KEY: "v2" });

    const content = readFileSync(join(TMP, ".env"), "utf-8");
    const matches = content.match(/API_KEY=/g);
    expect(matches).toHaveLength(1);
    expect(content).toContain("API_KEY=v2");
    expect(content).toContain("DB=postgres");
  });
});
