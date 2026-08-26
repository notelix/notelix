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
    "Chrome/Chromium was not found; pass its path as the first argument or CHROME_PATH",
  );
}
if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
  throw new Error("extension-build is missing; run `yarn package` first");
}

const server = http.createServer((request, response) => {
  if (request.url === "/embedded") {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(fs.readFileSync(path.join(root, "embedded.html"), "utf8"));
    return;
  }

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

  if (request.url === "/users/login") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        id: 1,
        name: "smoke-user",
        jwt: "smoke-jwt",
        client_side_encryption: "",
      }),
    );
    return;
  }

  if (request.url === "/annotations/queryByUrl") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ list: [] }));
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
      { timeout: 15000 },
    );
    const extensionId = new URL(workerTarget.url()).host;
    const worker = await workerTarget.worker();
    const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.background.service_worker, "dist/background.dist.js");
    const baseUrl = `http://127.0.0.1:${port}`;
    await worker.evaluate(
      (serverUrl) =>
        new Promise((resolve) => {
          chrome.storage.sync.set(
            { notelix: { notelixServer: serverUrl } },
            resolve,
          );
        }),
      baseUrl,
    );

    const popup = await browser.newPage();
    const popupErrors = [];
    popup.on("pageerror", (error) => popupErrors.push(error.message));
    await popup.goto(
      `chrome-extension://${extensionId}/extension-options.html`,
      { waitUntil: "domcontentloaded" },
    );
    await popup.waitForFunction(
      () => document.querySelector("h1")?.textContent === "Login",
    );
    const initialStorage = await popup.evaluate(async () => {
      const read = (area) =>
        new Promise((resolve) => area.get(null, (value) => resolve(value)));
      return {
        local: await read(chrome.storage.local),
        sync: await read(chrome.storage.sync),
      };
    });
    assert.equal(initialStorage.local["notelix-auth"], undefined);
    assert.equal(initialStorage.sync.notelix.notelixUser, undefined);
    assert.equal(initialStorage.sync.notelix.notelixPassword, undefined);
    await popup.click('a[href="#/signup"]');
    await popup.waitForFunction(
      () => document.querySelector("h1")?.textContent === "Sign Up",
    );
    await popup.goto(
      `chrome-extension://${extensionId}/extension-options.html`,
      { waitUntil: "domcontentloaded" },
    );
    await popup.waitForFunction(
      () => document.querySelector("h1")?.textContent === "Login",
    );
    await popup.type('input[placeholder="username"]', "smoke-user");
    await popup.type('input[placeholder="password"]', "smoke-password");
    const dialogHandled = new Promise((resolve) => {
      popup.once("dialog", async (dialog) => {
        await dialog.accept();
        resolve();
      });
    });
    await popup.click("button");
    await dialogHandled;
    await popup.waitForFunction(() =>
      document.body.textContent.includes("Logged In as smoke-user"),
    );
    const authenticatedStorage = await popup.evaluate(async () => {
      const read = (area) =>
        new Promise((resolve) => area.get(null, (value) => resolve(value)));
      return {
        local: await read(chrome.storage.local),
        sync: await read(chrome.storage.sync),
      };
    });
    assert.equal(authenticatedStorage.local["notelix-auth"].jwt, "smoke-jwt");
    assert.equal(authenticatedStorage.sync.notelix.notelixUser, undefined);
    assert.equal(authenticatedStorage.sync.notelix.notelixPassword, undefined);
    assert.equal(
      JSON.stringify(authenticatedStorage).includes("smoke-password"),
      false,
    );

    const responses = await popup.evaluate(async (baseUrl) => {
      const send = (url) =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { cmd: "apiCall", params: { method: "GET", url } },
            resolve,
          );
        });
      return Promise.all([send(`${baseUrl}/json`), send(`${baseUrl}/empty`)]);
    }, baseUrl);
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
      "notelix-annotate-popover",
    );
    assert.equal(
      await contentPage.$eval(
        "#notelix-edit-annotation-popover",
        (node) => node.id,
      ),
      "notelix-edit-annotation-popover",
    );
    assert.deepEqual(contentErrors, []);

    const embeddedPage = await browser.newPage();
    await embeddedPage.setRequestInterception(true);
    embeddedPage.on("request", (request) => {
      if (request.url().startsWith(baseUrl)) {
        request.continue();
      } else {
        request.abort();
      }
    });
    await embeddedPage.goto(`${baseUrl}/embedded`, {
      waitUntil: "domcontentloaded",
    });
    const firstDemoToken = await embeddedPage.evaluate(
      () => window.NotelixEmbeddedConfig.staticToken,
    );
    assert.match(firstDemoToken, /^[0-9a-f]{64}$/);
    await embeddedPage.reload({ waitUntil: "domcontentloaded" });
    assert.equal(
      await embeddedPage.evaluate(
        () => window.NotelixEmbeddedConfig.staticToken,
      ),
      firstDemoToken,
    );
    await embeddedPage.evaluate(() =>
      localStorage.removeItem("notelix-embedded-demo-token"),
    );
    await embeddedPage.reload({ waitUntil: "domcontentloaded" });
    const replacementDemoToken = await embeddedPage.evaluate(
      () => window.NotelixEmbeddedConfig.staticToken,
    );
    assert.match(replacementDemoToken, /^[0-9a-f]{64}$/);
    assert.notEqual(replacementDemoToken, firstDemoToken);

    console.log(
      `Chrome extension smoke test passed (${manifest.name} ${manifest.version})`,
    );
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
