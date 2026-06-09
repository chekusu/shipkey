import type { SecretBackend, SecretRef, SecretEntry } from "../../src/backends/types";

export class MockBackend implements SecretBackend {
  readonly name = "Mock";
  readonly calls: { method: string; args: any[] }[] = [];
  private store = new Map<string, string>();

  async isAvailable() {
    return true;
  }

  async checkStatus() {
    return "ready" as const;
  }

  async read(ref: SecretRef) {
    this.calls.push({ method: "read", args: [ref] });
    const key = `${ref.provider}/${ref.project}-${ref.env}/${ref.field}`;
    const value = this.store.get(key);
    if (value === undefined) {
      throw new Error(`Not found: ${key}`);
    }
    return value;
  }

  async write(entry: SecretEntry) {
    this.calls.push({ method: "write", args: [entry] });
    const key = `${entry.ref.provider}/${entry.ref.project}-${entry.ref.env}/${entry.ref.field}`;
    this.store.set(key, entry.value);
  }

  async list(project?: string, env?: string, vault?: string) {
    this.calls.push({ method: "list", args: [project, env, vault] });
    const refs: SecretRef[] = [];
    for (const [key] of this.store) {
      // Parse "Provider/project-env/field"
      const parts = key.split("/");
      if (parts.length !== 3) continue;
      const [provider, section, field] = parts;
      const dashIndex = section.lastIndexOf("-");
      if (dashIndex === -1) continue;
      const proj = section.slice(0, dashIndex);
      const e = section.slice(dashIndex + 1);
      if (project && proj !== project) continue;
      if (env && e !== env) continue;
      refs.push({ vault: vault ?? "mock", provider, project: proj, env: e, field });
    }
    return refs;
  }

  buildInlineRef() {
    return null;
  }

  seed(
    provider: string,
    project: string,
    env: string,
    field: string,
    value: string
  ) {
    this.store.set(`${provider}/${project}-${env}/${field}`, value);
  }

  reset() {
    this.calls.length = 0;
    this.store.clear();
  }
}
