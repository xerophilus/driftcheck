import * as path from "path";
import { findFiles, readFileIfExists } from "../utils.js";
import type { SourceResult } from "../types.js";

const PATTERNS = [
  /process\.env\.([A-Z_][A-Z0-9_]*)/g,
  /process\.env\["([A-Z_][A-Z0-9_]*)"\]/g,
  /process\.env\['([A-Z_][A-Z0-9_]*)'\]/g,
  /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
  /Deno\.env\.get\(["']([A-Z_][A-Z0-9_]*)["']\)/g,
  /os\.environ(?:\.get)?\(["']([A-Z_][A-Z0-9_]*)["']\)/g,
  /os\.getenv\(["']([A-Z_][A-Z0-9_]*)["']\)/g,
];

const DYNAMIC_PATTERNS = [
  /process\.env\[([a-z_][a-zA-Z0-9_]*)\]/,
  /Deno\.env\.get\(([a-z_][a-zA-Z0-9_]*)\)/,
  /os\.environ\[([a-z_][a-zA-Z0-9_]*)\]/,
];

export function scanCodeForEnvVars(rootDir: string): SourceResult[] {
  const extensions = /\.(js|ts|jsx|tsx|py|go|mjs|cjs)$/;
  const files = findFiles(rootDir, extensions);

  const keys = new Map<string, { file: string; line: number }[]>();
  const dynamicAccess: { file: string; line: number }[] = [];
  let fileCount = 0;

  for (const filePath of files) {
    const content = readFileIfExists(filePath);
    if (!content) continue;

    fileCount++;
    const lines = content.split("\n");
    const relativePath = path.relative(rootDir, filePath);

    lines.forEach((line, index) => {
      for (const pattern of PATTERNS) {
        const matches = line.matchAll(pattern);
        for (const match of matches) {
          const key = match[1];
          const location = { file: relativePath, line: index + 1 };

          if (!keys.has(key)) {
            keys.set(key, []);
          }
          keys.get(key)!.push(location);
        }
      }

      for (const pattern of DYNAMIC_PATTERNS) {
        if (pattern.test(line)) {
          dynamicAccess.push({
            file: relativePath,
            line: index + 1,
          });
          break;
        }
      }
    });
  }

  const results: SourceResult[] = [];

  if (keys.size > 0 || dynamicAccess.length > 0) {
    results.push({
      source: `code(${fileCount} files)`,
      keys,
    });
  }

  if (dynamicAccess.length > 0) {
    const dynamicKeys = new Map<string, { file: string; line: number }[]>();
    dynamicKeys.set("_DYNAMIC_ACCESS_", dynamicAccess);
    results.push({
      source: "dynamic-access",
      keys: dynamicKeys,
    });
  }

  return results;
}
