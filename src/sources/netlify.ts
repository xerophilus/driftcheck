import * as path from "path";
import { readFileIfExists } from "../utils.js";
import type { SourceResult } from "../types.js";

interface NetlifyConfig {
  siteId?: string;
  token?: string;
}

export async function scanNetlify(
  rootDir: string,
  config?: NetlifyConfig
): Promise<SourceResult[]> {
  const token = config?.token || process.env.NETLIFY_AUTH_TOKEN;
  if (!token) return [];

  let siteId = config?.siteId;

  if (!siteId) {
    const stateJson = readFileIfExists(
      path.join(rootDir, ".netlify", "state.json")
    );
    if (stateJson) {
      try {
        const parsed = JSON.parse(stateJson);
        siteId = parsed.siteId;
      } catch {
        // Invalid JSON
      }
    }
  }

  if (!siteId) return [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `https://api.netlify.com/api/v1/accounts/${siteId}/env`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const envVars = await response.json();

    const keys = new Map<string, { file: string; line: number }[]>();

    if (Array.isArray(envVars)) {
      envVars.forEach((envVar) => {
        if (envVar.key) {
          keys.set(envVar.key, [{ file: "netlify", line: 1 }]);
        }
      });
    }

    if (keys.size === 0) return [];

    return [
      {
        source: "netlify",
        keys,
      },
    ];
  } catch {
    return [];
  }
}
