import * as path from "path";
import { readFileIfExists } from "../utils.js";
import type { SourceResult } from "../types.js";

interface VercelConfig {
  projectId?: string;
  token?: string;
}

export async function scanVercel(
  rootDir: string,
  config?: VercelConfig
): Promise<SourceResult[]> {
  const token = config?.token || process.env.VERCEL_TOKEN;
  if (!token) return [];

  let projectId = config?.projectId;

  if (!projectId) {
    const vercelJson = readFileIfExists(
      path.join(rootDir, ".vercel", "project.json")
    );
    if (vercelJson) {
      try {
        const parsed = JSON.parse(vercelJson);
        projectId = parsed.projectId;
      } catch {
        // Invalid JSON
      }
    }
  }

  if (!projectId) return [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `https://api.vercel.com/v10/projects/${projectId}/env`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const data = await response.json();

    const envsByTarget: Record<string, Set<string>> = {
      production: new Set(),
      preview: new Set(),
      development: new Set(),
    };

    if (data.envs && Array.isArray(data.envs)) {
      for (const env of data.envs) {
        if (env.key && env.target) {
          const targets = Array.isArray(env.target) ? env.target : [env.target];
          targets.forEach((target: string) => {
            if (envsByTarget[target]) {
              envsByTarget[target].add(env.key);
            }
          });
        }
      }
    }

    const results: SourceResult[] = [];

    for (const [target, keySet] of Object.entries(envsByTarget)) {
      if (keySet.size > 0) {
        const keys = new Map<string, { file: string; line: number }[]>();
        keySet.forEach((key) => {
          keys.set(key, [{ file: `vercel[${target}]`, line: 1 }]);
        });

        results.push({
          source: `vercel[${target}]`,
          env: target,
          keys,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}
