import type { KeyGraph, Check, CheckResult } from "../types.js";

export function runChecks(graph: KeyGraph): CheckResult {
  const checks: Check[] = [];

  checks.push(...checkMissingInProduction(graph));
  checks.push(...checkMissingInExample(graph));
  checks.push(...checkStaleKeys(graph));
  checks.push(...checkScopeGaps(graph));
  checks.push(...checkPublicLeaks(graph));
  checks.push(...checkCIUndefined(graph));
  checks.push(...checkDuplicates(graph));
  checks.push(...checkDynamicAccess(graph));

  const errors = checks.filter((c) => c.severity === "error").length;
  const warnings = checks.filter((c) => c.severity === "warning").length;
  const info = checks.filter((c) => c.severity === "info").length;

  return { checks, errors, warnings, info };
}

function checkMissingInProduction(graph: KeyGraph): Check[] {
  const checks: Check[] = [];
  const codeKeys = getKeysFromSource(graph, "code");
  const prodKeys = getKeysFromSource(graph, "vercel[production]");
  const envKeys = getKeysFromSource(graph, ".env");

  for (const key of codeKeys) {
    if (!prodKeys.has(key) && envKeys.has(key)) {
      const locations = getLocations(graph, key, "code");
      checks.push({
        severity: "error",
        type: "MISSING IN PROD",
        key,
        message: `used in code · set in .env · absent from production`,
        locations: locations.slice(0, 1),
        suggestion: `vercel env add ${key} production`,
      });
    }
  }

  return checks;
}

function checkMissingInExample(graph: KeyGraph): Check[] {
  const checks: Check[] = [];
  const codeKeys = getKeysFromSource(graph, "code");
  const exampleKeys = getKeysFromSource(graph, ".env.example");

  for (const key of codeKeys) {
    if (!exampleKeys.has(key) && !key.startsWith("NODE_")) {
      const locations = getLocations(graph, key, "code");
      checks.push({
        severity: "warning",
        type: "NOT IN EXAMPLE",
        key,
        message: `used in code · missing from .env.example`,
        locations: locations.slice(0, 1),
      });
    }
  }

  return checks;
}

function checkStaleKeys(graph: KeyGraph): Check[] {
  const checks: Check[] = [];
  const codeKeys = getKeysFromSource(graph, "code");
  const exampleKeys = getKeysFromSource(graph, ".env.example");

  for (const key of exampleKeys) {
    if (!codeKeys.has(key)) {
      checks.push({
        severity: "warning",
        type: "STALE",
        key,
        message: `in .env.example but never referenced in code`,
      });
    }
  }

  return checks;
}

function checkScopeGaps(graph: KeyGraph): Check[] {
  const checks: Check[] = [];
  const previewKeys = getKeysFromSource(graph, "vercel[preview]");
  const prodKeys = getKeysFromSource(graph, "vercel[production]");

  for (const key of previewKeys) {
    if (!prodKeys.has(key)) {
      checks.push({
        severity: "error",
        type: "SCOPE GAP",
        key,
        message: `Vercel[preview] ✔  Vercel[production] ✗`,
      });
    }
  }

  return checks;
}

function checkPublicLeaks(graph: KeyGraph): Check[] {
  const checks: Check[] = [];
  const codeKeys = getKeysFromSource(graph, "code");

  for (const key of codeKeys) {
    if (
      (key.startsWith("NEXT_PUBLIC_") || key.startsWith("VITE_")) &&
      (key.includes("SECRET") ||
        key.includes("KEY") ||
        key.includes("TOKEN") ||
        key.includes("PASSWORD"))
    ) {
      const locations = getLocations(graph, key, "code");
      checks.push({
        severity: "warning",
        type: "PUBLIC LEAK RISK",
        key,
        message: `exposed to client bundle`,
        locations: locations.slice(0, 1),
      });
    }
  }

  return checks;
}

function checkCIUndefined(graph: KeyGraph): Check[] {
  const checks: Check[] = [];
  const githubSecrets = getKeysFromSource(graph, "github-secrets");
  const githubVars = getKeysFromSource(graph, "github-vars");

  for (const [sourceName, source] of graph.sources) {
    if (sourceName.includes(".github/workflows")) {
      for (const key of source.keys.keys()) {
        const inSecrets = githubSecrets.has(key);
        const inVars = githubVars.has(key);

        if (!inSecrets && !inVars && key !== "_DYNAMIC_ACCESS_") {
          const locations = getLocations(graph, key, sourceName);
          checks.push({
            severity: "error",
            type: "CI SECRET UNDEFINED",
            key,
            message: `referenced in workflow · not in GitHub secrets or vars`,
            locations: locations.slice(0, 1),
          });
        }
      }
    }
  }

  return checks;
}

function checkDuplicates(graph: KeyGraph): Check[] {
  const checks: Check[] = [];
  const keyCounts = new Map<string, number>();

  for (const [sourceName, source] of graph.sources) {
    if (
      sourceName.startsWith(".env") &&
      !sourceName.includes("example") &&
      !sourceName.includes("sample")
    ) {
      for (const [key, locations] of source.keys) {
        if (locations.length > 1) {
          keyCounts.set(
            key,
            (keyCounts.get(key) || 0) + (locations.length - 1)
          );
        }
      }
    }
  }

  for (const [key, count] of keyCounts) {
    if (count > 0) {
      checks.push({
        severity: "warning",
        type: "DUPLICATE",
        key,
        message: `defined ${count + 1} times`,
      });
    }
  }

  return checks;
}

function checkDynamicAccess(graph: KeyGraph): Check[] {
  const checks: Check[] = [];
  const dynamicSource = graph.sources.get("dynamic-access");

  if (dynamicSource) {
    const locations = dynamicSource.keys.get("_DYNAMIC_ACCESS_") || [];
    for (const loc of locations) {
      checks.push({
        severity: "info",
        type: "DYNAMIC ACCESS",
        key: "",
        message: `process.env[variable] — review manually`,
        locations: [loc],
      });
    }
  }

  return checks;
}

function getKeysFromSource(graph: KeyGraph, sourceName: string): Set<string> {
  const keys = new Set<string>();

  for (const [name, source] of graph.sources) {
    if (name.includes(sourceName)) {
      for (const key of source.keys.keys()) {
        if (key !== "_DYNAMIC_ACCESS_") {
          keys.add(key);
        }
      }
    }
  }

  return keys;
}

function getLocations(
  graph: KeyGraph,
  key: string,
  sourceName: string
): { file: string; line: number }[] {
  for (const [name, source] of graph.sources) {
    if (name.includes(sourceName)) {
      const locs = source.keys.get(key);
      if (locs) return locs;
    }
  }
  return [];
}
