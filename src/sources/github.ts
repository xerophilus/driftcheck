import { execSync } from "child_process";
import type { SourceResult } from "../types.js";

interface GitHubConfig {
  repo?: string;
  token?: string;
}

export async function scanGitHubSecrets(
  rootDir: string,
  config?: GitHubConfig
): Promise<SourceResult[]> {
  const token = config?.token || process.env.GITHUB_TOKEN;
  if (!token) return [];

  let repo = config?.repo;

  if (!repo) {
    try {
      const remoteUrl = execSync("git remote get-url origin", {
        cwd: rootDir,
        encoding: "utf-8",
      }).trim();

      const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);
      if (match) {
        repo = match[1];
      }
    } catch {
      return [];
    }
  }

  if (!repo) return [];

  const secrets = new Set<string>();
  const vars = new Set<string>();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const [secretsRes, varsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}/actions/secrets`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        signal: controller.signal,
      }),
      fetch(`https://api.github.com/repos/${repo}/actions/variables`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        signal: controller.signal,
      }),
    ]);

    clearTimeout(timeoutId);

    if (secretsRes.ok) {
      const data = await secretsRes.json();
      if (data.secrets && Array.isArray(data.secrets)) {
        data.secrets.forEach((s: any) => {
          if (s.name) secrets.add(s.name);
        });
      }
    }

    if (varsRes.ok) {
      const data = await varsRes.json();
      if (data.variables && Array.isArray(data.variables)) {
        data.variables.forEach((v: any) => {
          if (v.name) vars.add(v.name);
        });
      }
    }
  } catch {
    return [];
  }

  const results: SourceResult[] = [];

  if (secrets.size > 0) {
    const keys = new Map<string, { file: string; line: number }[]>();
    secrets.forEach((key) => {
      keys.set(key, [{ file: "github-secrets", line: 1 }]);
    });

    results.push({
      source: "github-secrets",
      keys,
    });
  }

  if (vars.size > 0) {
    const keys = new Map<string, { file: string; line: number }[]>();
    vars.forEach((key) => {
      keys.set(key, [{ file: "github-vars", line: 1 }]);
    });

    results.push({
      source: "github-vars",
      keys,
    });
  }

  return results;
}
