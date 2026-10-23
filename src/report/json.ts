import type { CheckResult, KeyGraph } from "../types.js";

export function renderJSON(result: CheckResult, graph: KeyGraph): string {
  const output = {
    checks: result.checks.map((check) => ({
      severity: check.severity,
      type: check.type,
      key: check.key,
      message: check.message,
      locations: check.locations,
      suggestion: check.suggestion,
    })),
    summary: {
      errors: result.errors,
      warnings: result.warnings,
      info: result.info,
    },
    sources: Array.from(graph.sources.keys()).filter(
      (s) => s !== "dynamic-access"
    ),
  };

  return JSON.stringify(output, null, 2);
}
