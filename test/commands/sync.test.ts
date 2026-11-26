import { describe, test, expect } from "bun:test";
import { MockBackend } from "../helpers/mock-backend";
import { syncTarget } from "../../src/commands/sync";
import { buildSecretRefMap, configuredSecretRefs } from "../../src/config";
import { OnePasswordBackend } from "../../src/backends/onepassword";
import { BitwardenBackend } from "../../src/backends/bitwarden";

describe("sync command logic", () => {
  test("syncs configured fields through a backend without inline references and counts failures", async () => {
    const backend = new MockBackend();
    backend.seed("Demo", "myapp", "prod", "FIELD", "fixture");
    const refs = configuredSecretRefs({ vault: "shipkey", project: "myapp", providers: { Demo: { fields: ["FIELD"] } } });
    const target = {
      name: "test", isAvailable: async () => true, checkStatus: async () => "ready" as const, installHint: () => "",
      sync: async (items: { name: string; value: string }[]) => {
        expect(items).toEqual([{ name: "FIELD", value: "fixture" }]);
        return { success: ["FIELD"], failed: [] };
      },
    };
    expect(await syncTarget(target, { destination: ["FIELD", "MISSING"] }, refs, backend)).toBe(1);
  });

  test("buildSecretRefMap produces resolvable refs for 1Password", () => {
    const config = {
      project: "myapp",
      vault: "shipkey",
      providers: {
        OpenAI: { fields: ["OPENAI_API_KEY"] },
        Stripe: { fields: ["STRIPE_SECRET_KEY"] },
      },
    };
    const backend = new OnePasswordBackend();
    const refMap = buildSecretRefMap(config, backend, "prod");

    expect(refMap.get("OPENAI_API_KEY")).toBe(
      "op://shipkey/OpenAI/myapp-prod/OPENAI_API_KEY"
    );
    expect(refMap.get("STRIPE_SECRET_KEY")).toBe(
      "op://shipkey/Stripe/myapp-prod/STRIPE_SECRET_KEY"
    );
  });

  test("buildSecretRefMap returns null refs for Bitwarden", () => {
    const config = {
      project: "myapp",
      vault: "shipkey",
      providers: {
        OpenAI: { fields: ["OPENAI_API_KEY"] },
      },
    };
    const backend = new BitwardenBackend();
    const refMap = buildSecretRefMap(config, backend, "prod");

    expect(refMap.get("OPENAI_API_KEY")).toBeNull();
  });

  test("MockBackend reads secrets correctly for sync", async () => {
    const backend = new MockBackend();
    backend.seed("OpenAI", "myapp", "prod", "OPENAI_API_KEY", "sk-real-key");

    const value = await backend.read({
      vault: "shipkey",
      provider: "OpenAI",
      project: "myapp",
      env: "prod",
      field: "OPENAI_API_KEY",
    });
    expect(value).toBe("sk-real-key");
  });

  test("MockBackend.read throws for missing secrets", async () => {
    const backend = new MockBackend();
    await expect(
      backend.read({
        vault: "shipkey",
        provider: "OpenAI",
        project: "myapp",
        env: "prod",
        field: "NONEXISTENT",
      })
    ).rejects.toThrow("Not found");
  });
});
