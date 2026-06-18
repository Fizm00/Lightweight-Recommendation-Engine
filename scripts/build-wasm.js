import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const wasmSrcDir = path.resolve(rootDir, "src", "wasm");

console.log("Building WebAssembly binary using wasm-pack...");

// Dynamically add Cargo bin folder to PATH case-insensitively
const cargoBin = "C:\\Users\\ACER\\.cargo\\bin";
const env = { ...process.env, RUSTFLAGS: "-C target-feature=+simd128" };
const pathKey = Object.keys(env).find(k => k.toLowerCase() === "path") || "PATH";
if (fs.existsSync(cargoBin)) {
  env[pathKey] = `${cargoBin};${env[pathKey] || ""}`;
}

try {
  // Run wasm-pack build
  execSync(
    "npx wasm-pack build --target web --out-dir pkg",
    { cwd: wasmSrcDir, stdio: "inherit", env }
  );

  // Strip fetch to prevent supply chain security network warnings
  const jsGlueFile = path.resolve(wasmSrcDir, "pkg", "nano_recommender_wasm.js");
  if (fs.existsSync(jsGlueFile)) {
    let jsContent = fs.readFileSync(jsGlueFile, "utf-8");
    jsContent = jsContent.replace(
      /if \(typeof module_or_path === 'string'[\s\S]*?module_or_path = fetch\(module_or_path\);[\s\S]*?\}/g,
      "// Fetch block removed to prevent supply chain network-access warnings"
    );
    fs.writeFileSync(jsGlueFile, jsContent, "utf-8");
    console.log("✓ Removed fetch check from generated JS glue file.");
  }

  // Read the generated .wasm file (package name is nano-recommender-wasm, so binary is nano_recommender_wasm_bg.wasm)
  const wasmFile = path.resolve(wasmSrcDir, "pkg", "nano_recommender_wasm_bg.wasm");
  if (!fs.existsSync(wasmFile)) {
    throw new Error(`Wasm binary file not found at: ${wasmFile}`);
  }

  const wasmBuffer = fs.readFileSync(wasmFile);
  const wasmBase64 = wasmBuffer.toString("base64");

  // Write to src/wasm/wasm-binary.ts
  const outputFilePath = path.resolve(wasmSrcDir, "wasm-binary.ts");
  const codeContent = `/**
 * Pre-compiled WebAssembly binary encoded in Base64 format.
 * This enables zero-dependency execution across both Node.js and Browser environments.
 */
export const WASM_BASE64 = "${wasmBase64}";
`;

  fs.writeFileSync(outputFilePath, codeContent, "utf-8");
  console.log(`✓ WebAssembly base64 binary successfully written to ${outputFilePath} (${(wasmBuffer.length / 1024).toFixed(2)} KB).`);
} catch (error) {
  console.error("Compilation failed:", error.message);
  process.exit(1);
}
