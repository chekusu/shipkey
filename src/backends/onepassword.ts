import type { SecretBackend, SecretRef, SecretEntry } from "./types";

async function exec(args: string[]): Promise<string> {
  const proc = Bun.spawn(["op", ...args], {
    stdout: "pipe",
    stderr: "pipe",
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

  buildRef(ref: SecretRef): string {
    return `op://${ref.vault}/${ref.provider}/${ref.project}.${ref.env}/${ref.field}`;
  }

  buildWriteArgs(entry: SecretEntry): string[] {
    const { ref, value } = entry;
    const section = `${ref.project}.${ref.env}`;
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
    try {
      await exec(["--version"]);
      return true;
    } catch {
      return false;
    }
  }

  async read(ref: SecretRef): Promise<string> {
    return exec(["read", this.buildRef(ref)]);
  }

  async write(entry: SecretEntry): Promise<void> {
    const { ref, value } = entry;
    const section = `${ref.project}.${ref.env}`;
    const fieldKey = `${section}.${ref.field}`;

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

  async list(project?: string, env?: string): Promise<SecretRef[]> {
    const raw = await exec([
      "item",
      "list",
      "--vault",
      "Dev",
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
        const dotIndex = sectionLabel.indexOf(".");
        if (dotIndex === -1) continue;

        const proj = sectionLabel.slice(0, dotIndex);
        const e = sectionLabel.slice(dotIndex + 1);

        if (project && proj !== project) continue;
        if (env && e !== env) continue;

        refs.push({
          vault: "Dev",
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
