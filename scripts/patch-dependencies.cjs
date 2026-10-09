// query-string 7 is used by Expo Router 57. Its one CommonJS decoder import needs
// an interop adapter for the maintainer's patched ESM decoder 0.5.0. No parsing
// behavior is forked here. Fail explicitly if an upstream update changes the seam.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "node_modules/query-string/package.json"));
if (pkg.version !== "7.1.3")
    throw new Error(
        "Review decoder interop patch against changed query-string version.",
    );
const file = path.join(root, "node_modules/query-string/index.js");
const before = "const decodeComponent = require('decode-uri-component');";
const after =
    "const decoderModule = require('decode-uri-component');\nconst decodeComponent = typeof decoderModule === 'function' ? decoderModule : decoderModule.default;";
const source = fs.readFileSync(file, "utf8");
if (source.includes(after)) process.exit(0);
if (!source.includes(before))
    throw new Error("Decoder interop patch no longer matches upstream source.");
fs.writeFileSync(file, source.replace(before, after));
