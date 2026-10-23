import * as fs from "fs";
import * as path from "path";
import { readFileIfExists } from "../utils.js";
import type { SourceResult } from "../types.js";

export function scanEnvFiles(rootDir: string): SourceResult[] {
  const results: SourceResult[] = [];
  const envFiles = [
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.example",
    ".env.sample",
    ".env.template",
  ];

  for (const fileName of envFiles) {
    const filePath = path.join(rootDir, fileName);
    const content = readFileIfExists(filePath);

    if (content) {
      const keys = new Map<string, { file: string; line: number }[]>();
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;

        const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
        if (match) {
          const key = match[1];
          const location = { file: fileName, line: index + 1 };

          if (!keys.has(key)) {
            keys.set(key, []);
          }
          keys.get(key)!.push(location);
        }
      });

      if (keys.size > 0) {
        const env = fileName.includes("production")
          ? "production"
          : fileName.includes("development")
            ? "development"
            : fileName.includes("example") || fileName.includes("sample")
              ? "example"
              : "local";

        results.push({
          source: fileName,
          env,
          keys,
        });
      }
    }
  }

  return results;
}
