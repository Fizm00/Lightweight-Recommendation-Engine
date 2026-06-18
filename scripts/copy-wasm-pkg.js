import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcPkgDir = path.resolve(rootDir, "src", "wasm", "pkg");
const destPkgDir = path.resolve(rootDir, "temp-build", "src", "wasm", "pkg");

if (fs.existsSync(srcPkgDir)) {
  fs.mkdirSync(destPkgDir, { recursive: true });
  fs.cpSync(srcPkgDir, destPkgDir, { recursive: true });
  console.log("✓ WebAssembly pkg folder successfully copied to temp-build.");
} else {
  console.warn("WASM pkg directory not found, skipping copy.");
}
