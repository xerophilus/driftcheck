import * as fs from "fs";
import * as path from "path";

export function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function findFiles(
  dir: string,
  pattern: RegExp,
  maxDepth = 10
): string[] {
  const results: string[] = [];
  const gitignore = loadGitignore(dir);

  function traverse(currentDir: string, depth: number) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath);

      if (shouldIgnore(relativePath, entry.isDirectory(), gitignore)) {
        continue;
      }

      if (entry.isDirectory()) {
        traverse(fullPath, depth + 1);
      } else if (pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  traverse(dir, 0);
  return results;
}

function loadGitignore(dir: string): Set<string> {
  const ignorePatterns = new Set<string>([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".vercel",
    "coverage",
  ]);

  const gitignorePath = path.join(dir, ".gitignore");
  const content = readFileIfExists(gitignorePath);
  if (content) {
    content.split("\n").forEach((line) => {
      line = line.trim();
      if (line && !line.startsWith("#")) {
        ignorePatterns.add(line.replace(/^\//, "").replace(/\/$/, ""));
      }
    });
  }

  return ignorePatterns;
}

function shouldIgnore(
  relativePath: string,
  isDirectory: boolean,
  patterns: Set<string>
): boolean {
  const parts = relativePath.split(path.sep);

  for (const part of parts) {
    if (patterns.has(part)) return true;
    if (isDirectory && patterns.has(part + "/")) return true;
  }

  return false;
}

export function parseEnvLine(line: string): string | null {
  line = line.trim();
  if (!line || line.startsWith("#")) return null;

  const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
  return match ? match[1] : null;
}
