import pc from "picocolors";
import type { CheckResult, KeyGraph } from "../types.js";

export function renderTTY(result: CheckResult, graph: KeyGraph, projectName: string): string {
  const lines: string[] = [];

  lines.push(
    `${pc.bold("driftcheck")} v1.0.0 · project: ${projectName} · ${pc.green("values are never read ✔")}`
  );

  const sources: string[] = [];
  for (const [name] of graph.sources) {
    if (name !== "dynamic-access") {
      sources.push(name);
    }
  }
  lines.push(`Sources: ${sources.join(" ")}`);
  lines.push("");

  const grouped = new Map<string, typeof result.checks>();
  for (const check of result.checks) {
    const key = `${check.severity}-${check.type}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(check);
  }

  const order = ["error", "warning", "info"];
  for (const severity of order) {
    for (const checks of grouped.values()) {
      if (checks[0]?.severity === severity) {
        for (const check of checks) {
          lines.push(formatCheck(check));
        }
      }
    }
  }

  if (result.checks.length === 0) {
    lines.push(pc.green("✔ No issues found"));
  } else {
    lines.push("");
    const parts: string[] = [];
    if (result.errors > 0) parts.push(`${result.errors} errors`);
    if (result.warnings > 0) parts.push(`${result.warnings} warnings`);
    if (result.info > 0) parts.push(`${result.info} info`);

    const summary = parts.join(" · ");
    const exitCode = result.errors > 0 ? 1 : 0;
    lines.push(`${summary}   (exit ${exitCode})`);

    const suggestions = result.checks.filter((c) => c.suggestion);
    if (suggestions.length > 0) {
      lines.push("");
      lines.push(pc.dim("Fix suggestions:"));
      suggestions.forEach((c) => {
        lines.push(pc.dim(`  ${c.suggestion}`));
      });
    }
  }

  return lines.join("\n");
}

function formatCheck(check: any): string {
  const icon =
    check.severity === "error"
      ? pc.red("✗")
      : check.severity === "warning"
        ? pc.yellow("⚠")
        : pc.blue("ℹ");

  const type = pc.bold(check.type.padEnd(20));
  const key = check.key ? pc.cyan(check.key.padEnd(25)) : "";

  let location = "";
  if (check.locations && check.locations.length > 0) {
    const loc = check.locations[0];
    location = pc.dim(`${loc.file}:${loc.line}`);
  }

  const message = check.message;

  return ` ${icon} ${type} ${key} ${message} ${location}`;
}
