import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { startServer } from "../../src/commands/setup";
import { MockBackend } from "../helpers/mock-backend";

const TMP = join(import.meta.dir, "__setup_e2e_fixtures__");

let server: ReturnType<typeof startServer>;
let baseUrl: string;
let backend: MockBackend;

function setupProject(opts: { cloudflare?: boolean; providers?: Record<string, { fields: string[] }> } = {}) {
  mkdirSync(TMP, { recursive: true });

  const config = {
    project: "testapp",
    vault: "shipkey",
    providers: opts.providers ?? {
      OpenAI: { fields: ["OPENAI_API_KEY"] },
      Stripe: { fields: ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"] },
    },
  };

  writeFileSync(join(TMP, "shipkey.json"), JSON.stringify(config, null, 2));

  if (opts.cloudflare) {
    writeFileSync(join(TMP, "wrangler.toml"), 'name = "my-worker"\n');
  }

  backend = new MockBackend();
  const configPath = join(TMP, "shipkey.json");
  server = startServer(configPath, "prod", TMP, backend);
  baseUrl = `http://localhost:${server.port}`;
}

afterEach(() => {
  server?.stop();
  rmSync(TMP, { recursive: true, force: true });
});

describe("e2e: setup server /api/store writes env-specific files", () => {
  // --- Regular project ---

  test("POST /api/store?env=dev → writes .env.development.local", async () => {
    setupProject();

    const res = await fetch(`${baseUrl}/api/store?env=dev`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "sk-dev-123" } }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(existsSync(join(TMP, ".env.development.local"))).toBe(true);
    const content = readFileSync(join(TMP, ".env.development.local"), "utf-8");
    expect(content).toContain("OPENAI_API_KEY=sk-dev-123");
  });

  test("POST /api/store?env=prod → writes .env.production.local", async () => {
    setupProject();

    const res = await fetch(`${baseUrl}/api/store?env=prod`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "sk-prod-456" } }),
    });

    expect(res.status).toBe(200);
    expect(existsSync(join(TMP, ".env.production.local"))).toBe(true);
    const content = readFileSync(join(TMP, ".env.production.local"), "utf-8");
    expect(content).toContain("OPENAI_API_KEY=sk-prod-456");
  });

  test("dev and prod stores create separate files", async () => {
    setupProject();

    // Store dev
    await fetch(`${baseUrl}/api/store?env=dev`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "sk-dev" } }),
    });

    // Store prod
    await fetch(`${baseUrl}/api/store?env=prod`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "sk-prod" } }),
    });

    const devContent = readFileSync(join(TMP, ".env.development.local"), "utf-8");
    const prodContent = readFileSync(join(TMP, ".env.production.local"), "utf-8");

    expect(devContent).toContain("OPENAI_API_KEY=sk-dev");
    expect(devContent).not.toContain("sk-prod");
    expect(prodContent).toContain("OPENAI_API_KEY=sk-prod");
    expect(prodContent).not.toContain("sk-dev");
  });

  test("multiple providers in same env accumulate in one file", async () => {
    setupProject();

    await fetch(`${baseUrl}/api/store?env=dev`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "sk-dev" } }),
    });

    await fetch(`${baseUrl}/api/store?env=dev`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "Stripe", fields: { STRIPE_SECRET_KEY: "sk_test_dev" } }),
    });

    const content = readFileSync(join(TMP, ".env.development.local"), "utf-8");
    expect(content).toContain("OPENAI_API_KEY=sk-dev");
    expect(content).toContain("STRIPE_SECRET_KEY=sk_test_dev");
  });

  // --- Cloudflare project ---

  test("Cloudflare: POST /api/store?env=dev → writes .dev.vars", async () => {
    setupProject({ cloudflare: true });

    const res = await fetch(`${baseUrl}/api/store?env=dev`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "sk-cf-dev" } }),
    });

    expect(res.status).toBe(200);
    expect(existsSync(join(TMP, ".dev.vars"))).toBe(true);
    const content = readFileSync(join(TMP, ".dev.vars"), "utf-8");
    expect(content).toContain("OPENAI_API_KEY=sk-cf-dev");
  });

  test("Cloudflare: POST /api/store?env=prod → writes .dev.vars.production", async () => {
    setupProject({ cloudflare: true });

    const res = await fetch(`${baseUrl}/api/store?env=prod`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "sk-cf-prod" } }),
    });

    expect(res.status).toBe(200);
    expect(existsSync(join(TMP, ".dev.vars.production"))).toBe(true);
    const content = readFileSync(join(TMP, ".dev.vars.production"), "utf-8");
    expect(content).toContain("OPENAI_API_KEY=sk-cf-prod");
  });

  test("Cloudflare: dev and prod create .dev.vars and .dev.vars.production separately", async () => {
    setupProject({ cloudflare: true });

    await fetch(`${baseUrl}/api/store?env=dev`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "cf-dev" } }),
    });

    await fetch(`${baseUrl}/api/store?env=prod`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "cf-prod" } }),
    });

    const devContent = readFileSync(join(TMP, ".dev.vars"), "utf-8");
    const prodContent = readFileSync(join(TMP, ".dev.vars.production"), "utf-8");

    expect(devContent).toContain("OPENAI_API_KEY=cf-dev");
    expect(devContent).not.toContain("cf-prod");
    expect(prodContent).toContain("OPENAI_API_KEY=cf-prod");
    expect(prodContent).not.toContain("cf-dev");
  });

  // --- Backward compatibility ---

  test("server default env (no ?env param) uses CLI --env value", async () => {
    // startServer was called with env="prod"
    setupProject();

    const res = await fetch(`${baseUrl}/api/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "sk-default" } }),
    });

    expect(res.status).toBe(200);
    // Default env is "prod" → .env.production.local
    expect(existsSync(join(TMP, ".env.production.local"))).toBe(true);
    const content = readFileSync(join(TMP, ".env.production.local"), "utf-8");
    expect(content).toContain("OPENAI_API_KEY=sk-default");
  });

  // --- Backend write verification ---

  test("store writes to backend with correct env in SecretRef", async () => {
    setupProject();

    await fetch(`${baseUrl}/api/store?env=dev`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "sk-dev" } }),
    });

    await fetch(`${baseUrl}/api/store?env=prod`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "sk-prod" } }),
    });

    // Backend should have two separate entries
    const writeCalls = backend.calls.filter((c) => c.method === "write");
    expect(writeCalls.length).toBeGreaterThanOrEqual(2);

    // Verify env values in refs
    const devWrite = writeCalls.find((c) => c.args[0].ref.env === "dev");
    const prodWrite = writeCalls.find((c) => c.args[0].ref.env === "prod");
    expect(devWrite).toBeDefined();
    expect(prodWrite).toBeDefined();
    expect(devWrite!.args[0].value).toBe("sk-dev");
    expect(prodWrite!.args[0].value).toBe("sk-prod");
  });

  // --- Merge behavior ---

  test("store merges with existing env-specific file content", async () => {
    setupProject();

    // Pre-existing file
    writeFileSync(join(TMP, ".env.development.local"), "MANUAL_KEY=manual_val\n");

    await fetch(`${baseUrl}/api/store?env=dev`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "sk-dev" } }),
    });

    const content = readFileSync(join(TMP, ".env.development.local"), "utf-8");
    expect(content).toContain("MANUAL_KEY=manual_val");
    expect(content).toContain("OPENAI_API_KEY=sk-dev");
  });

  test("store does not touch other env files", async () => {
    setupProject();

    writeFileSync(join(TMP, ".env"), "BASE=val\n");
    writeFileSync(join(TMP, ".env.local"), "LOCAL=val\n");

    await fetch(`${baseUrl}/api/store?env=dev`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", fields: { OPENAI_API_KEY: "sk-dev" } }),
    });

    // Other env files untouched
    expect(readFileSync(join(TMP, ".env"), "utf-8")).toBe("BASE=val\n");
    expect(readFileSync(join(TMP, ".env.local"), "utf-8")).toBe("LOCAL=val\n");
  });

  // --- Empty/whitespace fields skipped ---

  test("empty field values are not written to file", async () => {
    setupProject();

    await fetch(`${baseUrl}/api/store?env=dev`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "Stripe",
        fields: { STRIPE_SECRET_KEY: "sk_test_123", STRIPE_PUBLISHABLE_KEY: "  " },
      }),
    });

    const content = readFileSync(join(TMP, ".env.development.local"), "utf-8");
    expect(content).toContain("STRIPE_SECRET_KEY=sk_test_123");
    expect(content).not.toContain("STRIPE_PUBLISHABLE_KEY");
  });

  // --- /api/config returns env ---

  test("/api/config?env=dev returns the requested env", async () => {
    setupProject();
    const res = await fetch(`${baseUrl}/api/config?env=dev`);
    const body = await res.json();
    expect(body.env).toBe("dev");
  });

  test("/api/config without env returns server default", async () => {
    setupProject();
    const res = await fetch(`${baseUrl}/api/config`);
    const body = await res.json();
    expect(body.env).toBe("prod"); // startServer was called with "prod"
  });
});
