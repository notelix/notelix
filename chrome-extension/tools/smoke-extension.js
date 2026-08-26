const assert = require("assert/strict");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { launch } = require("puppeteer-core");

const root = path.resolve(__dirname, "..");
const extensionPath = path.join(root, "extension-build");
const candidates = [
  process.argv[2],
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
const headless = process.env.NOTELIX_HEADLESS === "true";

if (!executablePath) {
  throw new Error(
    "Chrome/Chromium was not found; pass its path as the first argument or CHROME_PATH"
  );
}
if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
  throw new Error("extension-build is missing; run `yarn package` first");
}

const server = http.createServer((request, response) => {
  if (request.url === "/empty") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url === "/json") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  response.writeHead(200, { "Content-Type": "text/html" });
  response.end("<!doctype html><title>Notelix smoke</title><p>annotate me</p>");
});

async function listen() {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function closeServer() {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main() {
  const port = await listen();
  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "notelix-chrome-"));
  let browser;

  try {
    browser = await launch({
      executablePath,
      headless,
      enableExtensions: true,
      userDataDir: profilePath,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-first-run",
        "--no-sandbox",
      ],
    });

    const workerTarget = await browser.waitForTarget(
      (target) =>
        target.type() === "service_worker" &&
        target.url().startsWith("chrome-extension://"),
      { timeout: 15000 }
    );
    const extensionId = new URL(workerTarget.url()).host;
    const worker = await workerTarget.worker();
    const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.background.service_worker, "dist/background.dist.js");

    const popup = await browser.newPage();
    const popupErrors = [];
    popup.on("pageerror", (error) => popupErrors.push(error.message));
    await popup.goto(
      `chrome-extension://${extensionId}/extension-options.html`,
      { waitUntil: "domcontentloaded" }
    );
    await popup.waitForFunction(
      () => document.querySelector("h1")?.textContent === "Login"
    );
    await popup.click('a[href="#/signup"]');
    await popup.waitForFunction(
      () => document.querySelector("h1")?.textContent === "Sign Up"
    );

    const responses = await popup.evaluate(async (baseUrl) => {
      const send = (url) =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { cmd: "apiCall", params: { method: "GET", url } },
            resolve
          );
        });
      return Promise.all([send(`${baseUrl}/json`), send(`${baseUrl}/empty`)]);
    }, `http://127.0.0.1:${port}`);
    assert.deepEqual(responses, [
      { status: 200, body: { ok: true } },
      { status: 204, body: null },
    ]);
    assert.deepEqual(popupErrors, []);

    const contentPage = await browser.newPage();
    const contentErrors = [];
    contentPage.on("pageerror", (error) => contentErrors.push(error.message));
    await contentPage.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "domcontentloaded",
    });
    await contentPage.waitForSelector("body.notelix-initialized");
    assert.equal(
      await contentPage.$eval("#notelix-annotate-popover", (node) => node.id),
      "notelix-annotate-popover"
    );
    assert.equal(
      await contentPage.$eval(
        "#notelix-edit-annotation-popover",
        (node) => node.id
      ),
      "notelix-edit-annotation-popover"
    );
    assert.deepEqual(contentErrors, []);

    console.log(`Chrome extension smoke test passed (${manifest.name} ${manifest.version})`);
  } finally {
    if (browser) {
      await browser.close();
    }
    await closeServer();
    fs.rmSync(profilePath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
