import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import esbuild from "../../web/node_modules/esbuild/lib/main.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "..");
const srcLambda = path.resolve(apiDir, "src/lambda.ts");
const outLambda = path.resolve(apiDir, "dist/lambda.mjs");
const oldJs = path.resolve(apiDir, "dist/lambda.js");

if (fs.existsSync(oldJs)) {
  fs.unlinkSync(oldJs);
}

await esbuild.build({
  entryPoints: [srcLambda],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: outLambda,
  external: ["pg-native"],
  banner: {
    js: `import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __pathDirname } from 'node:path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __pathDirname(__filename);`,
  },
});

console.log("✅ Self-contained Lambda successfully bundled with createRequire banner to dist/lambda.mjs");
