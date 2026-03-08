import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { SyncTarget, SyncResult, TargetStatus } from "./types";

export class CloudflareTarget implements SyncTarget {
  readonly name = "Cloudflare Workers";

  async checkStatus(): Promise<TargetStatus> {
    try {
      const proc = Bun.spawn(["wrangler", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
      if (proc.exitCode !== 0) return "not_installed";
    } catch {
      return "not_installed";
    }

    // Check auth by reading wrangler config file (avoids unreliable network call in Bun.spawn)
    try {
      const configPath = join(homedir(), "Library", "Preferences", ".wrangler", "config", "default.toml");
      const config = await readFile(configPath, "utf-8");
      if (config.includes("oauth_token") || config.includes("api_token")) {
        return "ready";
      }
      return "not_authenticated";
    } catch {
      // Fallback: try Linux/other OS path
      try {
        const configPath = join(homedir(), ".wrangler", "config", "default.toml");
        const config = await readFile(configPath, "utf-8");
        if (config.includes("oauth_token") || config.includes("api_token")) {
          return "ready";
        }
      } catch {}
      return "not_authenticated";
    }
  }

  async isAvailable(): Promise<boolean> {
    const status = await this.checkStatus();
    return status === "ready";
  }

  installHint(): string {
    return (
      "Wrangler CLI not found.\n" +
      "  Install: npm i -g wrangler\n" +
      "  Then:    wrangler login"
    );
  }

  buildCommand(secretName: string, projectName: string): string[] {
    return ["wrangler", "secret", "put", secretName, "--name", projectName];
  }

  async sync(
    secrets: { name: string; value: string }[],
    projectName: string
  ): Promise<SyncResult> {
    const result: SyncResult = { success: [], failed: [] };

    for (const secret of secrets) {
      try {
        const args = this.buildCommand(secret.name, projectName);
        const proc = Bun.spawn(args, {
          stdin: new Response(secret.value).body!,
          stdout: "pipe",
          stderr: "pipe",
        });
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
          result.failed.push({ name: secret.name, error: stderr.trim() });
        } else {
          result.success.push(secret.name);
        }
      } catch (err) {
        result.failed.push({
          name: secret.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }
}
