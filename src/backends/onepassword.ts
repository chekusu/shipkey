import type { SecretBackend, SecretRef, SecretEntry } from "./types";

async function exec(args: string[]): Promise<string> {
  const proc = Bun.spawn(["op", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, OP_BIOMETRIC_UNLOCK_ENABLED: "true" },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`op command failed: ${stderr.trim()}`);
  }
  return stdout.trim();
}

export class OnePasswordBackend implements SecretBackend {
  readonly name = "1Password";

  private sectionName(project: string, env: string): string {
    return `${project}-${env}`;
  }

  buildRef(ref: SecretRef): string {
    const section = this.sectionName(ref.project, ref.env);
    return `op://${ref.vault}/${ref.provider}/${section}/${ref.field}`;
  }

  buildWriteArgs(entry: SecretEntry): string[] {
    const { ref, value } = entry;
    const section = this.sectionName(ref.project, ref.env);
    const fieldKey = `${section}.${ref.field}`;
    return [
      "item",
      "edit",
      ref.provider,
      "--vault",
      ref.vault,
      `${fieldKey}[password]=${value}`,
    ];
  }

  async isAvailable(): Promise<boolean> {
    const status = await this.checkStatus();
    return status === "ready";
  }

  async checkStatus(): Promise<"not_installed" | "not_logged_in" | "ready"> {
    try {
      await exec(["--version"]);
    } catch {
      return "not_installed";
    }
    try {
      const output = await exec(["account", "list", "--format=json"]);
      const accounts = JSON.parse(output);
      if (!Array.isArray(accounts) || accounts.length === 0) {
        return "not_logged_in";
      }
      return "ready";
    } catch {
      return "not_logged_in";
    }
  }

  async read(ref: SecretRef): Promise<string> {
    return exec(["read", this.buildRef(ref)]);
  }

  async readRaw(opUri: string): Promise<string> {
    return exec(["read", opUri]);
  }

  async ensureVault(vault: string): Promise<void> {
    try {
      await exec(["vault", "get", vault]);
    } catch {
      await exec(["vault", "create", vault, "--icon", "vault-door"]);
    }
  }

  async write(entry: SecretEntry): Promise<void> {
    const { ref, value } = entry;
    const section = this.sectionName(ref.project, ref.env);
    const fieldKey = `${section}.${ref.field}`;

    await this.ensureVault(ref.vault);

    try {
      // Try editing existing item first
      await exec([
        "item",
        "edit",
        ref.provider,
        "--vault",
        ref.vault,
        `${fieldKey}[password]=${value}`,
      ]);
    } catch {
      // Item doesn't exist, create it
      await exec([
        "item",
        "create",
        "--vault",
        ref.vault,
        "--category",
        "API Credential",
        "--title",
        ref.provider,
        `${fieldKey}[password]=${value}`,
      ]);
    }
  }

  async list(project?: string, env?: string, vault = "shipkey"): Promise<SecretRef[]> {
    const raw = await exec([
      "item",
      "list",
      "--vault",
      vault,
      "--format",
      "json",
    ]);
    const items = JSON.parse(raw) as { title: string; id: string }[];
    const refs: SecretRef[] = [];

    for (const item of items) {
      const detail = await exec([
        "item",
        "get",
        item.id,
        "--format",
        "json",
      ]);
      const parsed = JSON.parse(detail);
      if (!parsed.fields) continue;

      for (const field of parsed.fields) {
        if (!field.section?.label) continue;
        const sectionLabel = field.section.label as string;
        const dashIndex = sectionLabel.lastIndexOf("-");
        if (dashIndex === -1) continue;

        const proj = sectionLabel.slice(0, dashIndex);
        const e = sectionLabel.slice(dashIndex + 1);

        if (project && proj !== project) continue;
        if (env && e !== env) continue;

        refs.push({
          vault,
          provider: item.title,
          project: proj,
          env: e,
          field: field.label,
        });
      }
    }

    return refs;
  }
}
