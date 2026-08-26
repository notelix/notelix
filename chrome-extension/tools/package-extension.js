const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const destination = path.join(root, "extension-build");
const appOnly = process.argv.includes("--app-only");

function copy(source, target) {
  fs.cpSync(path.join(root, source), path.join(destination, target), {
    recursive: true,
  });
}

if (appOnly) {
  fs.rmSync(path.join(destination, "dist"), { recursive: true, force: true });
  copy("dist", "dist");
  process.exit(0);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });

copy("dist", "dist");
copy("public", "public");
copy("extension-options.html", "extension-options.html");
copy("embedded.html", "embedded.html");
copy("app.html", "app.html");
copy("manifest.json", "manifest.json");
copy("LICENSES", "LICENSES");
fs.copyFileSync(
  path.join(root, "..", "LICENSE"),
  path.join(destination, "LICENSES", "notelix.LICENSE")
);
