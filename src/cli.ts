#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { scanEnvFiles } from "./sources/envFiles.js";
import { scanCodeForEnvVars } from "./sources/codeScanner.js";
import { scanDockerCompose } from "./sources/dockerCompose.js";
import { scanGitHubActions } from "./sources/githubActions.js";
import { scanVercel } from "./sources/vercel.js";
import { scanNetlify } from "./sources/netlify.js";
import { scanGitHubSecrets } from "./sources/github.js";
import { runChecks } from "./checks/index.js";
import { renderTTY } from "./report/tty.js";
import { renderJSON } from "./report/json.js";
import {
  loadLicense,
  saveLicense,
  checkFreeTierLimit,
  getProjectHash,
} from "./license.js";
import { readFileIfExists } from "./utils.js";
import type { KeyGraph, Config } from "./types.js";

async function main() {
  const args = process.argv.slice(2);
  const rootDir = process.cwd();

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log("deploydrift v1.0.0");
    process.exit(0);
  }

  if (args.includes("--privacy")) {
    printPrivacy();
    process.exit(0);
  }

  if (args[0] === "activate") {
    const key = args[1];
    if (!key) {
      console.error("Usage: deploydrift activate <license-key>");
      process.exit(1);
    }

    if (saveLicense(key)) {
      console.log("✓ License activated successfully");
      process.exit(0);
    } else {
      console.error("✗ Invalid license key");
      process.exit(1);
    }
  }

  if (args[0] === "license") {
    const license = loadLicense();
    if (license) {
      console.log(`Plan: ${license.plan}`);
      console.log(
        `Activated: ${new Date(license.purchased_at).toLocaleDateString()}`
      );
    } else {
      console.log("No license activated. Running in free tier (1 project).");
      console.log("Unlock unlimited projects for $29 lifetime.");
    }
    process.exit(0);
  }

  if (args[0] === "init") {
    await initConfig(rootDir);
    process.exit(0);
  }

  if (args[0] === "fix-example") {
    await fixExample(rootDir);
    process.exit(0);
  }

  const license = loadLicense();
  if (!license || license.plan === "free") {
    if (!checkFreeTierLimit(rootDir)) {
      console.error(
        "Free license covers 1 project. This is a different project."
      );
      console.error(
        "Unlock unlimited for $29 lifetime → https://deploydrift.pittsdev.com/buy"
      );
      process.exit(1);
    }
  }

  const config = loadConfig(rootDir);
  const isCI = args.includes("--ci");
  const jsonOutput = args.includes("--json");

  const graph: KeyGraph = {
    allKeys: new Set(),
    sources: new Map(),
  };

  const envResults = scanEnvFiles(rootDir);
  envResults.forEach((r) => {
    graph.sources.set(r.source, r);
    r.keys.forEach((_, key) => graph.allKeys.add(key));
  });

  const codeResults = scanCodeForEnvVars(rootDir);
  codeResults.forEach((r) => {
    graph.sources.set(r.source, r);
    r.keys.forEach((_, key) => graph.allKeys.add(key));
  });

  const composeResults = scanDockerCompose(rootDir);
  composeResults.forEach((r) => {
    graph.sources.set(r.source, r);
    r.keys.forEach((_, key) => graph.allKeys.add(key));
  });

  const actionsResults = scanGitHubActions(rootDir);
  actionsResults.forEach((r) => {
    graph.sources.set(r.source, r);
    r.keys.forEach((_, key) => graph.allKeys.add(key));
  });

  if (!args.includes("--only") || args.includes("vercel")) {
    const vercelResults = await scanVercel(rootDir, config.providers?.vercel);
    vercelResults.forEach((r) => {
      graph.sources.set(r.source, r);
      r.keys.forEach((_, key) => graph.allKeys.add(key));
    });
  }

  if (!args.includes("--only") || args.includes("netlify")) {
    const netlifyResults = await scanNetlify(
      rootDir,
      config.providers?.netlify
    );
    netlifyResults.forEach((r) => {
      graph.sources.set(r.source, r);
      r.keys.forEach((_, key) => graph.allKeys.add(key));
    });
  }

  if (!args.includes("--only") || args.includes("github")) {
    const githubResults = await scanGitHubSecrets(
      rootDir,
      config.providers?.github
    );
    githubResults.forEach((r) => {
      graph.sources.set(r.source, r);
      r.keys.forEach((_, key) => graph.allKeys.add(key));
    });
  }

  const result = runChecks(graph);

  const projectName = getProjectName(rootDir);

  if (jsonOutput) {
    console.log(renderJSON(result, graph));
  } else {
    console.log(renderTTY(result, graph, projectName));
  }

  const exitCode = result.errors > 0 ? 1 : 0;
  process.exit(exitCode);
}

function loadConfig(rootDir: string): Config {
  const content =
    readFileIfExists(path.join(rootDir, "deploydrift.config.json")) ||
    readFileIfExists(path.join(rootDir, "driftcheck.config.json"));

  if (content) {
    try {
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  return {};
}

function getProjectName(rootDir: string): string {
  try {
    const pkgPath = path.join(rootDir, "package.json");
    const content = readFileIfExists(pkgPath);
    if (content) {
      const pkg = JSON.parse(content);
      return pkg.name || path.basename(rootDir);
    }
  } catch {
    // Fall through
  }

  return path.basename(rootDir);
}

async function initConfig(rootDir: string) {
  const configPath = path.join(rootDir, "deploydrift.config.json");

  if (fs.existsSync(configPath) || fs.existsSync(path.join(rootDir, "driftcheck.config.json"))) {
    console.log("Config file already exists (deploydrift.config.json or driftcheck.config.json)");
    return;
  }

  const config: Config = {
    ignore: ["NODE_ENV", "PATH"],
    required: [],
    providers: {},
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("✓ Created deploydrift.config.json");

  console.log("\nAdd this to your CI workflow:");
  console.log(`
- name: Check env drift
  run: npx deploydrift --ci
`);
}

async function fixExample(rootDir: string) {
  const codeResults = scanCodeForEnvVars(rootDir);
  const allCodeKeys = new Set<string>();

  codeResults.forEach((r) => {
    r.keys.forEach((_, key) => {
      if (key !== "_DYNAMIC_ACCESS_") {
        allCodeKeys.add(key);
      }
    });
  });

  const examplePath = path.join(rootDir, ".env.example");
  const existingContent = readFileIfExists(examplePath) || "";
  const existingKeys = new Set<string>();

  existingContent.split("\n").forEach((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
    if (match) existingKeys.add(match[1]);
  });

  const newKeys = Array.from(allCodeKeys).filter((k) => !existingKeys.has(k));

  if (newKeys.length === 0) {
    console.log("✓ .env.example is already up to date");
    return;
  }

  const additions = newKeys.map((k) => `${k}=`).join("\n");
  const newContent = existingContent
    ? `${existingContent.trimEnd()}\n${additions}\n`
    : `${additions}\n`;

  fs.writeFileSync(examplePath, newContent);
  console.log(`✓ Added ${newKeys.length} keys to .env.example`);
}

function printHelp() {
  console.log(`deploydrift v1.0.0

Usage:
  deploydrift                     Run checks
  deploydrift --json              Output JSON
  deploydrift --ci                CI mode (strict, no color)
  deploydrift --only vercel,code  Check specific sources
  deploydrift init                Create config file
  deploydrift fix-example         Update .env.example
  deploydrift activate <key>      Activate license
  deploydrift license             Show license info
  deploydrift --privacy           Show privacy policy
  deploydrift --help              Show this help

Options:
  --json       Output JSON
  --ci         CI mode
  --only       Comma-separated sources to check
  --env        Environment filter (production, preview, development)
  --privacy    Show privacy policy

Environment variables:
  VERCEL_TOKEN          Vercel API token
  NETLIFY_AUTH_TOKEN    Netlify API token
  GITHUB_TOKEN          GitHub API token
  DRIFTCHECK_LICENSE    License key (for CI)
`);
}

function printPrivacy() {
  console.log(`deploydrift Privacy Policy

deploydrift never reads, stores, prints, or transmits secret VALUES.

It only compares variable NAMES (and, optionally, a local salted SHA-256
fingerprint of a value to detect "same vs different" across local files —
computed in memory, never written or sent).

Provider APIs are called with list-names endpoints only.

No telemetry. The only network calls are to providers YOU enable, using
tokens YOU supply via environment variables.

Your secrets stay yours.
`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(2);
});
