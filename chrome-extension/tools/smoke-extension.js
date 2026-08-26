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
const privateNote = "private smoke note must not reach page scripts";
const annotationRequests = [];

if (!executablePath) {
  throw new Error(
    "Chrome/Chromium was not found; pass its path as the first argument or CHROME_PATH"
  );
}
if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
  throw new Error("extension-build is missing; run `yarn package` first");
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
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
      })
    );
    return;
  }

  if (request.url === "/meta/version") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ notelix: true }));
    return;
  }

  if (request.url === "/annotations/queryByUrl") {
    annotationRequests.push({
      method: request.method,
      url: request.url,
      body: await readJsonBody(request),
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        list: [
          {
            id: 7,
            uid: "smoke-annotation",
            url: "",
            title: "Notelix smoke",
            host: "127.0.0.1",
            data: {
              color: "#fff59d",
              notes: privateNote,
              text: "annotate me",
              textBefore: "",
              textAfter: "",
            },
          },
        ],
      })
    );
    return;
  }

  if (["/annotations/save", "/annotations/delete"].includes(request.url)) {
    annotationRequests.push({
      method: request.method,
      url: request.url,
      body: await readJsonBody(request),
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({}));
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
    const baseUrl = `http://127.0.0.1:${port}`;
    await worker.evaluate(
      (serverUrl) =>
        new Promise((resolve) => {
          chrome.storage.sync.set(
            { notelix: { notelixServer: serverUrl } },
            resolve
          );
        }),
      baseUrl
    );

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
      () => document.querySelector("h1")?.textContent === "Sign Up"
    );
    await popup.goto(
      `chrome-extension://${extensionId}/extension-options.html`,
      { waitUntil: "domcontentloaded" }
    );
    await popup.waitForFunction(
      () => document.querySelector("h1")?.textContent === "Login"
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
      document.body.textContent.includes("Logged In as smoke-user")
    );
    const authenticatedStorage = await popup.evaluate(async () => {
      const read = (area) =>
        new Promise((resolve) => area.get(null, (value) => resolve(value)));
      return {
        local: await read(chrome.storage.local),
        sync: await read(chrome.storage.sync),
      };
    });
    assert.equal(
      authenticatedStorage.local["notelix-auth"].user.jwt,
      "smoke-jwt"
    );
    assert.equal(authenticatedStorage.local["notelix-auth"].server, baseUrl);
    assert.equal(authenticatedStorage.sync.notelix.notelixUser, undefined);
    assert.equal(authenticatedStorage.sync.notelix.notelixPassword, undefined);
    assert.equal(
      JSON.stringify(authenticatedStorage).includes("smoke-password"),
      false
    );

    await popup.evaluate(
      () =>
        new Promise((resolve) => {
          chrome.storage.local.set(
            { "notelix-encryption-key": "smoke-encryption-key" },
            resolve
          );
        })
    );
    await popup.goto(
      `chrome-extension://${extensionId}/extension-options.html#/login`,
      { waitUntil: "domcontentloaded" }
    );
    await popup.waitForFunction(
      () => document.querySelector("h1")?.textContent === "Login"
    );
    const serverChangeConfirmed = new Promise((resolve) => {
      popup.once("dialog", async (dialog) => {
        await dialog.accept();
        resolve();
      });
    });
    await popup.evaluate(() =>
      [...document.querySelectorAll("a")]
        .find((link) => link.textContent === "Change Server")
        .click()
    );
    await serverChangeConfirmed;
    await popup.waitForFunction(
      () => document.querySelector("h1")?.textContent === "Setup"
    );
    const serverChangeStorage = await popup.evaluate(async () => {
      const read = (area) =>
        new Promise((resolve) => area.get(null, (value) => resolve(value)));
      return {
        local: await read(chrome.storage.local),
        sync: await read(chrome.storage.sync),
      };
    });
    assert.equal(serverChangeStorage.local["notelix-auth"], undefined);
    assert.equal(
      serverChangeStorage.local["notelix-encryption-key"],
      undefined
    );
    assert.equal(serverChangeStorage.sync.notelix.notelixServer, undefined);
    await popup.click('input[placeholder="Notelix Server Address"]');
    await popup.keyboard.down("Control");
    await popup.keyboard.press("A");
    await popup.keyboard.up("Control");
    await popup.type('input[placeholder="Notelix Server Address"]', baseUrl);
    assert.equal(
      await popup.$eval(
        'input[placeholder="Notelix Server Address"]',
        (input) => input.value
      ),
      baseUrl
    );
    await popup.click("button");
    await popup.waitForFunction(
      () => document.querySelector("h1")?.textContent === "Login"
    );
    await popup.evaluate(
      (serverUrl) =>
        new Promise((resolve) => {
          chrome.storage.local.set(
            {
              "notelix-auth": {
                version: 1,
                server: serverUrl,
                user: { id: 1, name: "smoke-user", jwt: "smoke-jwt" },
              },
            },
            resolve
          );
        }),
      baseUrl
    );

    const responses = await popup.evaluate(async (baseUrl) => {
      const send = (url) =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { cmd: "apiCall", params: { method: "GET", url } },
            resolve
          );
        });
      return Promise.all([
        send(`${baseUrl}/json`),
        send(`${baseUrl}/empty`),
        send("http://127.0.0.1:18565/meta/health"),
        send("https://unconfigured.example/private"),
      ]);
    }, baseUrl);
    assert.deepEqual(responses, [
      { status: 200, body: { ok: true } },
      { status: 204, body: null },
      { err: "background API request is not allowed" },
      { err: "background API request is not allowed" },
    ]);
    assert.deepEqual(popupErrors, []);

    const contentPage = await browser.newPage();
    const contentErrors = [];
    contentPage.on("pageerror", (error) => contentErrors.push(error.message));
    await contentPage.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "domcontentloaded",
    });
    await contentPage.waitForSelector("body.notelix-initialized");
    await contentPage.waitForSelector(
      'web-marker-highlight[highlight-id="smoke-annotation"]'
    );
    await contentPage.waitForSelector("#notes-smoke-annotation");
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
    const pageVisibleAnnotationState = await contentPage.evaluate((secret) => {
      const host = document.getElementById("notes-smoke-annotation");
      return {
        bodyTextContainsSecret: document.body.textContent.includes(secret),
        bodyInnerTextContainsSecret: document.body.innerText.includes(secret),
        htmlContainsSecret: document.documentElement.innerHTML.includes(secret),
        hostText: host.textContent,
        hostInnerText: host.innerText,
        shadowRoot: host.shadowRoot,
      };
    }, privateNote);
    assert.deepEqual(pageVisibleAnnotationState, {
      bodyTextContainsSecret: false,
      bodyInnerTextContainsSecret: false,
      htmlContainsSecret: false,
      hostText: "",
      hostInnerText: "",
      shadowRoot: null,
    });

    const syntheticHighlightDisplay = await contentPage.evaluate(async () => {
      document
        .querySelector('web-marker-highlight[highlight-id="smoke-annotation"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      return getComputedStyle(
        document.getElementById("notelix-edit-annotation-popover")
      ).display;
    });
    assert.equal(syntheticHighlightDisplay, "none");

    const mutatingRequestsBeforeSyntheticEvents = annotationRequests.filter(
      (request) => request.url !== "/annotations/queryByUrl"
    ).length;
    const syntheticDialogs = [];
    const syntheticDialogHandler = async (dialog) => {
      syntheticDialogs.push(dialog.type());
      await dialog.dismiss();
    };
    contentPage.on("dialog", syntheticDialogHandler);
    await contentPage.evaluate(() => {
      const text = document.querySelector("p").firstChild;
      const range = document.createRange();
      range.selectNodeContents(text);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      const annotatePopover = document.getElementById(
        "notelix-annotate-popover"
      );
      annotatePopover.style.display = "flex";
      annotatePopover
        .querySelector(".color")
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      window.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, code: "Digit1" })
      );

      const editPopover = document.getElementById(
        "notelix-edit-annotation-popover"
      );
      editPopover.style.display = "flex";
      document
        .getElementById("notelix-button-trash")
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      document
        .getElementById("notelix-button-notes")
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    contentPage.off("dialog", syntheticDialogHandler);
    assert.deepEqual(syntheticDialogs, []);
    assert.equal(
      annotationRequests.filter(
        (request) => request.url !== "/annotations/queryByUrl"
      ).length,
      mutatingRequestsBeforeSyntheticEvents
    );

    await contentPage.evaluate(() => {
      document.getElementById("notelix-edit-annotation-popover").style.display =
        "none";
    });
    await contentPage.click(
      'web-marker-highlight[highlight-id="smoke-annotation"]'
    );
    await contentPage.waitForFunction(
      () =>
        getComputedStyle(
          document.getElementById("notelix-edit-annotation-popover")
        ).display === "flex"
    );
    const trustedNotePrompt = new Promise((resolve) => {
      contentPage.once("dialog", async (dialog) => {
        const details = {
          type: dialog.type(),
          message: dialog.message(),
          defaultValue: dialog.defaultValue(),
        };
        await dialog.dismiss();
        resolve(details);
      });
    });
    await contentPage.click("#notelix-button-notes");
    assert.deepEqual(await trustedNotePrompt, {
      type: "prompt",
      message: "Write some notes..",
      defaultValue: privateNote,
    });
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
      () => window.NotelixEmbeddedConfig.staticToken
    );
    assert.match(firstDemoToken, /^[0-9a-f]{64}$/);
    await embeddedPage.reload({ waitUntil: "domcontentloaded" });
    assert.equal(
      await embeddedPage.evaluate(
        () => window.NotelixEmbeddedConfig.staticToken
      ),
      firstDemoToken
    );
    await embeddedPage.evaluate(() =>
      localStorage.removeItem("notelix-embedded-demo-token")
    );
    await embeddedPage.reload({ waitUntil: "domcontentloaded" });
    const replacementDemoToken = await embeddedPage.evaluate(
      () => window.NotelixEmbeddedConfig.staticToken
    );
    assert.match(replacementDemoToken, /^[0-9a-f]{64}$/);
    assert.notEqual(replacementDemoToken, firstDemoToken);

    console.log(
      `Chrome extension smoke test passed (${manifest.name} ${manifest.version})`
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
