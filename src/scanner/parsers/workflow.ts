import { readdir, readFile } from "fs/promises";
import { join } from "path";

export interface WorkflowScanResult {
  secrets: string[];
  files: string[];
  wranglerCommands: string[];
}

const SECRETS_RE = /\$\{\{\s*secrets\.([A-Z_][A-Z0-9_]*)\s*\}\}/g;
const WRANGLER_ACTION_RE = /uses:\s*cloudflare\/wrangler-action/g;
const WRANGLER_COMMAND_RE = /command:\s*(.+)/g;

export async function scanWorkflows(
  projectRoot: string
): Promise<WorkflowScanResult> {
  const workflowDir = join(projectRoot, ".github", "workflows");
  const secrets = new Set<string>();
  const files: string[] = [];
  const wranglerCommands: string[] = [];

  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(workflowDir, { withFileTypes: true });
  } catch {
    return { secrets: [], files: [], wranglerCommands: [] };
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".yml") && !entry.name.endsWith(".yaml")) continue;

    const fullPath = join(workflowDir, entry.name);
    const content = await readFile(fullPath, "utf-8");
    let match: RegExpExecArray | null;
    let found = false;

    SECRETS_RE.lastIndex = 0;
    while ((match = SECRETS_RE.exec(content)) !== null) {
      secrets.add(match[1]);
      found = true;
    }

    // Detect cloudflare/wrangler-action commands
    WRANGLER_ACTION_RE.lastIndex = 0;
    if (WRANGLER_ACTION_RE.test(content)) {
      WRANGLER_COMMAND_RE.lastIndex = 0;
      let cmdMatch: RegExpExecArray | null;
      while ((cmdMatch = WRANGLER_COMMAND_RE.exec(content)) !== null) {
        const cmd = cmdMatch[1].trim();
        if (cmd && !wranglerCommands.includes(cmd)) {
          wranglerCommands.push(cmd);
        }
      }
    }

    if (found) {
      files.push(`.github/workflows/${entry.name}`);
    }
  }

  return { secrets: [...secrets], files, wranglerCommands };
}

const SSH_RE = /git@github\.com:(.+?)\.git$/;
const HTTPS_RE = /https:\/\/github\.com\/(.+?)(?:\.git)?$/;

export async function detectGitRepo(
  projectRoot: string
): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "remote", "get-url", "origin"], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    const url = output.trim();
    if (!url) return null;

    const sshMatch = SSH_RE.exec(url);
    if (sshMatch) return sshMatch[1];

    const httpsMatch = HTTPS_RE.exec(url);
    if (httpsMatch) return httpsMatch[1];

    return null;
  } catch {
    return null;
  }
}
