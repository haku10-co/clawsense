const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = path.join(root, "native", "ocr-helper", "main.swift");
const outDir = path.join(root, "native", "bin");
const outFile = path.join(outDir, "ClawSenseOCR");
const moduleCache = path.join(root, "native", ".build", "module-cache");

if (process.platform !== "darwin") {
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(moduleCache, { recursive: true });

if (fs.existsSync(outFile)) {
  const sourceMtime = fs.statSync(source).mtimeMs;
  const outputMtime = fs.statSync(outFile).mtimeMs;
  if (outputMtime >= sourceMtime) {
    process.exit(0);
  }
}

execFileSync(
  "xcrun",
  [
    "swiftc",
    source,
    "-O",
    "-module-cache-path",
    moduleCache,
    "-framework",
    "Foundation",
    "-framework",
    "Vision",
    "-o",
    outFile
  ],
  { stdio: "inherit" }
);

fs.chmodSync(outFile, 0o755);
