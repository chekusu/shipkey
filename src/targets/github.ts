import type { SyncTarget, SyncResult, TargetStatus } from "./types";

export class GitHubTarget implements SyncTarget {
  readonly name = "GitHub Actions";

  async checkStatus(): Promise<TargetStatus> {
    try {
      const versionProc = Bun.spawn(["gh", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await versionProc.exited;
      if (versionProc.exitCode !== 0) return "not_installed";
    } catch {
      return "not_installed";
    }

    try {
      const authProc = Bun.spawn(["gh", "auth", "status"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await authProc.exited;
      if (authProc.exitCode !== 0) return "not_authenticated";
    } catch {
      return "not_authenticated";
    }

    return "ready";
  }

  async isAvailable(): Promise<boolean> {
    const status = await this.checkStatus();
    return status === "ready";
  }

  installHint(): string {
    return (
      "GitHub CLI (gh) not found or not authenticated.\n" +
      "  Install: brew install gh\n" +
      "  Then:    gh auth login"
    );
  }

  buildCommand(secretName: string, value: string, repo: string): string[] {
    return ["gh", "secret", "set", secretName, "-b", value, "--repo", repo];
  }

  async sync(
    secrets: { name: string; value: string }[],
    repo: string
  ): Promise<SyncResult> {
    const result: SyncResult = { success: [], failed: [] };

    for (const secret of secrets) {
      try {
        const args = this.buildCommand(secret.name, secret.value, repo);
        const proc = Bun.spawn(args, {
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
