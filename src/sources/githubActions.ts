import * as path from "path";
import YAML from "yaml";
import { readFileIfExists, findFiles } from "../utils.js";
import type { SourceResult } from "../types.js";

export function scanGitHubActions(rootDir: string): SourceResult[] {
  const results: SourceResult[] = [];
  const workflowDir = path.join(rootDir, ".github", "workflows");

  try {
    const files = findFiles(workflowDir, /\.ya?ml$/);

    for (const filePath of files) {
      const content = readFileIfExists(filePath);
      if (!content) continue;

      try {
        const keys = new Map<string, { file: string; line: number }[]>();
        const relativePath = path.relative(rootDir, filePath);

        extractKeysFromWorkflow(content, relativePath, keys);

        if (keys.size > 0) {
          results.push({
            source: `.github/workflows/${path.basename(filePath)}`,
            keys,
          });
        }
      } catch {
        // Skip invalid YAML
      }
    }
  } catch {
    // No workflows directory
  }

  return results;
}

function extractKeysFromWorkflow(
  content: string,
  file: string,
  keys: Map<string, { file: string; line: number }[]>
) {
  const secretPattern = /\$\{\{\s*secrets\.([A-Z_][A-Z0-9_]*)\s*\}\}/g;
  const varPattern = /\$\{\{\s*vars\.([A-Z_][A-Z0-9_]*)\s*\}\}/g;

  const lines = content.split("\n");
  lines.forEach((line, index) => {
    const secretMatches = line.matchAll(secretPattern);
    for (const match of secretMatches) {
      const key = match[1];
      if (!keys.has(key)) {
        keys.set(key, []);
      }
      keys.get(key)!.push({ file, line: index + 1 });
    }

    const varMatches = line.matchAll(varPattern);
    for (const match of varMatches) {
      const key = match[1];
      if (!keys.has(key)) {
        keys.set(key, []);
      }
      keys.get(key)!.push({ file, line: index + 1 });
    }
  });

  try {
    const doc = YAML.parse(content);
    extractEnvBlocks(doc, content, file, keys);
  } catch {
    // Fallback to regex only
  }
}

function extractEnvBlocks(
  doc: any,
  content: string,
  file: string,
  keys: Map<string, { file: string; line: number }[]>
) {
  if (!doc || typeof doc !== "object") return;

  if (doc.env && typeof doc.env === "object") {
    Object.keys(doc.env).forEach((key) => {
      if (/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        if (!keys.has(key)) {
          keys.set(key, []);
        }
        keys.get(key)!.push({ file, line: findLineInContent(content, key) });
      }
    });
  }

  if (doc.jobs && typeof doc.jobs === "object") {
    for (const job of Object.values(doc.jobs)) {
      if (typeof job === "object" && job && "env" in job) {
        const env = (job as any).env;
        if (typeof env === "object") {
          Object.keys(env).forEach((key) => {
            if (/^[A-Z_][A-Z0-9_]*$/.test(key)) {
              if (!keys.has(key)) {
                keys.set(key, []);
              }
              keys
                .get(key)!
                .push({ file, line: findLineInContent(content, key) });
            }
          });
        }
      }

      if (typeof job === "object" && job && "steps" in job) {
        const steps = (job as any).steps;
        if (Array.isArray(steps)) {
          steps.forEach((step) => {
            if (step && typeof step === "object" && step.env) {
              Object.keys(step.env).forEach((key) => {
                if (/^[A-Z_][A-Z0-9_]*$/.test(key)) {
                  if (!keys.has(key)) {
                    keys.set(key, []);
                  }
                  keys
                    .get(key)!
                    .push({ file, line: findLineInContent(content, key) });
                }
              });
            }
          });
        }
      }
    }
  }
}

function findLineInContent(content: string, key: string): number {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(key)) {
      return i + 1;
    }
  }
  return 1;
}
