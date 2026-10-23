import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, "..", "dist", "cli.js");

let content = fs.readFileSync(cliPath, "utf-8");

if (!content.startsWith("#!/usr/bin/env node")) {
  content = "#!/usr/bin/env node\n" + content;
  fs.writeFileSync(cliPath, content);
}

fs.chmodSync(cliPath, 0o755);

console.log("✓ Added shebang to cli.js");
