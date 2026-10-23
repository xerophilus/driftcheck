import * as path from "path";
import YAML from "yaml";
import { readFileIfExists, findFiles } from "../utils.js";
import type { SourceResult } from "../types.js";

export function scanDockerCompose(rootDir: string): SourceResult[] {
  const results: SourceResult[] = [];
  const composeFiles = findFiles(rootDir, /^docker-compose.*\.ya?ml$/);

  for (const filePath of composeFiles) {
    const content = readFileIfExists(filePath);
    if (!content) continue;

    try {
      const doc = YAML.parse(content);
      const keys = new Map<string, { file: string; line: number }[]>();
      const relativePath = path.relative(rootDir, filePath);

      extractKeysFromCompose(doc, content, relativePath, keys);

      if (keys.size > 0) {
        results.push({
          source: path.basename(filePath),
          keys,
        });
      }
    } catch {
      // Skip invalid YAML
    }
  }

  return results;
}

function extractKeysFromCompose(
  doc: any,
  content: string,
  file: string,
  keys: Map<string, { file: string; line: number }[]>
) {
  if (!doc || typeof doc !== "object") return;

  if (doc.services && typeof doc.services === "object") {
    for (const service of Object.values(doc.services)) {
      if (
        typeof service === "object" &&
        service &&
        "environment" in service
      ) {
        const env = (service as any).environment;
        if (Array.isArray(env)) {
          env.forEach((item) => {
            if (typeof item === "string") {
              const key = item.split("=")[0].trim();
              if (/^[A-Z_][A-Z0-9_]*$/.test(key)) {
                addKey(keys, key, file, findLineNumber(content, key));
              }
            }
          });
        } else if (typeof env === "object") {
          Object.keys(env).forEach((key) => {
            if (/^[A-Z_][A-Z0-9_]*$/.test(key)) {
              addKey(keys, key, file, findLineNumber(content, key));
            }
          });
        }
      }
    }
  }

  const varPattern = /\$\{([A-Z_][A-Z0-9_]*?)(?::-[^}]*)?\}/g;
  const matches = content.matchAll(varPattern);

  for (const match of matches) {
    const key = match[1];
    addKey(keys, key, file, findLineNumber(content, match[0]));
  }
}

function addKey(
  keys: Map<string, { file: string; line: number }[]>,
  key: string,
  file: string,
  line: number
) {
  if (!keys.has(key)) {
    keys.set(key, []);
  }
  keys.get(key)!.push({ file, line });
}

function findLineNumber(content: string, searchStr: string): number {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchStr)) {
      return i + 1;
    }
  }
  return 1;
}
