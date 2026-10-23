import { describe, it, expect } from "vitest";
import { scanEnvFiles } from "../src/sources/envFiles.js";
import { scanCodeForEnvVars } from "../src/sources/codeScanner.js";
import { runChecks } from "../src/checks/index.js";
import { renderJSON } from "../src/report/json.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const SENTINEL_VALUE = "SUPER_SECRET_PASSWORD_12345";
const SENTINEL_KEY = "DATABASE_PASSWORD";

describe("Privacy Test - Values Never Exposed", () => {
  it("should never expose secret values in any output", () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftcheck-test-"));

    fs.writeFileSync(
      path.join(testDir, ".env"),
      `${SENTINEL_KEY}=${SENTINEL_VALUE}\nAPI_KEY=another_secret_value_xyz\n`
    );

    fs.writeFileSync(
      path.join(testDir, "test.ts"),
      `const dbPass = process.env.${SENTINEL_KEY};\n`
    );

    const envResults = scanEnvFiles(testDir);
    const codeResults = scanCodeForEnvVars(testDir);

    const graph = {
      allKeys: new Set<string>(),
      sources: new Map(),
    };

    [...envResults, ...codeResults].forEach((r) => {
      graph.sources.set(r.source, r);
      r.keys.forEach((_, key) => graph.allKeys.add(key));
    });

    const checkResult = runChecks(graph);
    const jsonOutput = renderJSON(checkResult, graph);

    expect(jsonOutput).not.toContain(SENTINEL_VALUE);
    expect(jsonOutput).not.toContain("SUPER_SECRET");
    expect(jsonOutput).not.toContain("another_secret_value");

    expect(jsonOutput).toContain(SENTINEL_KEY);

    const allResults = JSON.stringify([...envResults, ...codeResults]);
    expect(allResults).not.toContain(SENTINEL_VALUE);

    fs.rmSync(testDir, { recursive: true });
  });
});

describe("Env File Scanner", () => {
  it("should extract only keys from .env files", () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftcheck-test-"));

    fs.writeFileSync(
      path.join(testDir, ".env"),
      "DATABASE_URL=postgres://localhost\nAPI_KEY=secret123\n"
    );

    const results = scanEnvFiles(testDir);

    expect(results.length).toBeGreaterThan(0);
    const envResult = results.find((r) => r.source === ".env");
    expect(envResult).toBeDefined();
    expect(envResult!.keys.has("DATABASE_URL")).toBe(true);
    expect(envResult!.keys.has("API_KEY")).toBe(true);

    fs.rmSync(testDir, { recursive: true });
  });

  it("should scan .env.example files", () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftcheck-test-"));

    fs.writeFileSync(path.join(testDir, ".env.example"), "PORT=\nHOST=\n");

    const results = scanEnvFiles(testDir);
    const exampleResult = results.find((r) => r.source === ".env.example");

    expect(exampleResult).toBeDefined();
    expect(exampleResult!.keys.has("PORT")).toBe(true);
    expect(exampleResult!.keys.has("HOST")).toBe(true);

    fs.rmSync(testDir, { recursive: true });
  });
});

describe("Code Scanner", () => {
  it("should find process.env references", () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftcheck-test-"));

    fs.writeFileSync(
      path.join(testDir, "app.ts"),
      `
      const dbUrl = process.env.DATABASE_URL;
      const apiKey = process.env["API_KEY"];
      const port = process.env.PORT || 3000;
    `
    );

    const results = scanCodeForEnvVars(testDir);

    expect(results.length).toBeGreaterThan(0);
    const codeResult = results.find((r) => r.source.includes("code"));
    expect(codeResult).toBeDefined();
    expect(codeResult!.keys.has("DATABASE_URL")).toBe(true);
    expect(codeResult!.keys.has("API_KEY")).toBe(true);
    expect(codeResult!.keys.has("PORT")).toBe(true);

    fs.rmSync(testDir, { recursive: true });
  });

  it("should detect dynamic access", () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftcheck-test-"));

    fs.writeFileSync(
      path.join(testDir, "dynamic.ts"),
      `const value = process.env[key];`
    );

    const results = scanCodeForEnvVars(testDir);
    const dynamicResult = results.find((r) => r.source === "dynamic-access");

    expect(dynamicResult).toBeDefined();

    fs.rmSync(testDir, { recursive: true });
  });
});

describe("Checks", () => {
  it("should detect missing-in-example", () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftcheck-test-"));

    fs.writeFileSync(
      path.join(testDir, ".env"),
      "DATABASE_URL=postgres://localhost\n"
    );
    fs.writeFileSync(path.join(testDir, ".env.example"), "PORT=\n");
    fs.writeFileSync(
      path.join(testDir, "app.ts"),
      `const db = process.env.DATABASE_URL;`
    );

    const envResults = scanEnvFiles(testDir);
    const codeResults = scanCodeForEnvVars(testDir);

    const graph = {
      allKeys: new Set<string>(),
      sources: new Map(),
    };

    [...envResults, ...codeResults].forEach((r) => {
      graph.sources.set(r.source, r);
      r.keys.forEach((_, key) => graph.allKeys.add(key));
    });

    const checkResult = runChecks(graph);

    const notInExample = checkResult.checks.find(
      (c) => c.type === "NOT IN EXAMPLE" && c.key === "DATABASE_URL"
    );
    expect(notInExample).toBeDefined();

    fs.rmSync(testDir, { recursive: true });
  });

  it("should detect public leak risks", () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftcheck-test-"));

    fs.writeFileSync(
      path.join(testDir, "app.ts"),
      `const key = process.env.NEXT_PUBLIC_API_SECRET;`
    );

    const codeResults = scanCodeForEnvVars(testDir);

    const graph = {
      allKeys: new Set<string>(),
      sources: new Map(),
    };

    codeResults.forEach((r) => {
      graph.sources.set(r.source, r);
      r.keys.forEach((_, key) => graph.allKeys.add(key));
    });

    const checkResult = runChecks(graph);

    const leakCheck = checkResult.checks.find(
      (c) => c.type === "PUBLIC LEAK RISK"
    );
    expect(leakCheck).toBeDefined();

    fs.rmSync(testDir, { recursive: true });
  });
});
