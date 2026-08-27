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
const artifactDirectory = process.env.NOTELIX_UI_ARTIFACT_DIR;
const smokeTimeoutMs = 60000;
const privateNote = "private smoke note must not reach page scripts";
const annotationRequests = [];
const sharedDemoToken = "d".repeat(64);
const demoAnnotations = new Map();

if (!executablePath) {
  throw new Error(
    "Chrome/Chromium was not found; pass its path as the first argument or CHROME_PATH",
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
  if (request.url === "/product") {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(
      fs.readFileSync(
        path.join(root, "..", "server", "public", "index.html"),
        "utf8",
      ),
    );
    return;
  }

  if (request.url === "/assets/site.css") {
    response.writeHead(200, { "Content-Type": "text/css" });
    response.end(
      fs.readFileSync(
        path.join(root, "..", "server", "public", "assets", "site.css"),
        "utf8",
      ),
    );
    return;
  }

  if (request.url === "/assets/site.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" });
    response.end(
      fs.readFileSync(
        path.join(root, "..", "server", "public", "assets", "site.js"),
        "utf8",
      ),
    );
    return;
  }

  if (request.url === "/embedded") {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(
      fs.readFileSync(
        path.join(root, "..", "server", "public", "embedded", "index.html"),
        "utf8",
      ),
    );
    return;
  }

  if (request.url === "/embedded/demo-session.js") {
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "text/javascript; charset=utf-8",
    });
    response.end(
      `window.NotelixEmbeddedConfig = Object.freeze({
        server: window.location.origin,
        staticToken: ${JSON.stringify(sharedDemoToken)},
        rootElementClassName: "notelix-enabled",
        demoLocalOnly: false,
        language: "en",
        theme: "light"
      });`,
    );
    return;
  }

  if (request.url === "/assets/embedded.css") {
    response.writeHead(200, { "Content-Type": "text/css" });
    response.end(
      fs.readFileSync(
        path.join(root, "..", "server", "public", "assets", "embedded.css"),
        "utf8",
      ),
    );
    return;
  }

  if (request.url === "/assets/embedded.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" });
    response.end(
      fs.readFileSync(
        path.join(root, "..", "server", "public", "assets", "embedded.js"),
        "utf8",
      ),
    );
    return;
  }

  if (request.url === "/embedded/content-script.dist.js") {
    response.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
    });
    response.end(
      fs.readFileSync(
        path.join(extensionPath, "dist", "content-script.dist.js"),
        "utf8",
      ),
    );
    return;
  }

  if (
    ["/customized-embedded-light", "/customized-embedded-dark"].includes(
      request.url,
    )
  ) {
    const dark = request.url.endsWith("-dark");
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html lang="en"><head>
      ${dark ? "" : '<style id="dark-reader-style"></style>'}
      <script>
        window.NotelixEmbeddedConfig = {
          server: window.location.origin,
          staticToken: "${"a".repeat(64)}",
          rootElementClassName: "notelix-enabled",
          demoLocalOnly: true,
          language: "${dark ? "en" : "zh-CN"}",
          theme: "${dark ? "dark" : "light"}"
        };
      </script>
      <script defer src="/embedded/content-script.dist.js"></script>
    </head><body><p class="notelix-enabled">customized embed</p></body></html>`);
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

  if (request.url === "/meta/version") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ notelix: true }));
    return;
  }

  if (request.url === "/annotations/queryByUrl") {
    const body = await readJsonBody(request);
    annotationRequests.push({
      method: request.method,
      url: request.url,
      body,
    });
    const list = body?.url?.endsWith("/embedded")
      ? [...demoAnnotations.values()].filter(
          (annotation) => annotation.url === body.url,
        )
      : [
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
        ];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ list }));
    return;
  }

  if (request.url === "/annotations/find") {
    const body = await readJsonBody(request);
    const url = `http://${request.headers.host}/`;
    const annotation = {
      id: 7,
      uid: "smoke-annotation",
      url,
      title: "Notelix smoke",
      host: "127.0.0.1",
      created_at: "2026-08-27T00:00:00.000Z",
      updated_at: "2026-08-27T00:00:00.000Z",
      data: {
        color: "#eeff00",
        notes: privateNote,
        text: "annotate me",
        textBefore: "Remember to ",
        textAfter: " while testing.",
      },
    };
    let list;
    if (body.groupBy === "host") {
      list = [{ host: "127.0.0.1", count: "1" }];
    } else if (body.groupBy === "title") {
      list = [{ title: "Notelix smoke", count: "1" }];
    } else {
      list = [annotation];
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ list }));
    return;
  }

  if (request.url === "/annotations/search") {
    const body = await readJsonBody(request);
    const url = `http://${request.headers.host}/`;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        results: {
          hits: body.q
            ? [
                {
                  id: 7,
                  uid: "smoke-annotation",
                  url,
                  title: "Notelix smoke",
                  host: "127.0.0.1",
                  color: "#eeff00",
                  notes: privateNote,
                  text: "annotate me",
                  textBefore: "Remember to ",
                  textAfter: " while testing.",
                  _formatted: {
                    title: "Notelix smoke",
                    text: "<em>annotate</em> me",
                    notes: privateNote,
                  },
                },
              ]
            : [],
        },
      }),
    );
    return;
  }

  if (["/annotations/save", "/annotations/delete"].includes(request.url)) {
    const body = await readJsonBody(request);
    annotationRequests.push({
      method: request.method,
      url: request.url,
      body,
    });
    if (
      request.url === "/annotations/save" &&
      body?.url?.endsWith("/embedded")
    ) {
      demoAnnotations.set(body.uid, {
        ...body,
        id: body.id || demoAnnotations.size + 1,
      });
    }
    if (request.url === "/annotations/delete") {
      demoAnnotations.delete(body?.uid);
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({}));
    return;
  }

  response.writeHead(200, { "Content-Type": "text/html" });
  response.end(`<!doctype html><html lang="zh-CN">
    <title>Notelix smoke</title>
    <style>
      .notelix-notes-inline {
        background: white !important;
        border: 8px solid red !important;
        box-shadow: 0 0 0 20px red !important;
        display: block !important;
        height: 160px !important;
        margin: 40px !important;
        padding: 30px !important;
        width: 70px !important;
      }
    </style>
    <p>annotate me</p>`);
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

async function capture(page, name, options = {}) {
  if (!artifactDirectory) return;
  fs.mkdirSync(artifactDirectory, { recursive: true });
  await page.screenshot({
    fullPage: options.fullPage || false,
    path: path.join(artifactDirectory, `${name}.png`),
  });
}

async function newSmokePage(browserOrContext) {
  const page = await browserOrContext.newPage();
  page.setDefaultTimeout(smokeTimeoutMs);
  page.setDefaultNavigationTimeout(smokeTimeoutMs);
  return page;
}

async function waitForValue(readValue, isReady, description) {
  const deadline = Date.now() + smokeTimeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await readValue();
    if (isReady(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function assertAccessibleControls(page) {
  const missingNames = await page.$$eval(
    'button, input:not([type="hidden"]), textarea, select, a[href]',
    (elements) =>
      elements
        .filter((element) => {
          if (element.getAttribute("aria-label")?.trim()) return false;
          if (element.getAttribute("aria-labelledby")?.trim()) return false;
          if (
            element.labels &&
            [...element.labels].some((label) => label.textContent.trim())
          ) {
            return false;
          }
          if (element.textContent?.trim()) return false;
          if (element.getAttribute("title")?.trim()) return false;
          return true;
        })
        .map((element) => element.outerHTML.slice(0, 180)),
  );
  assert.deepEqual(missingNames, []);
}

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `horizontal overflow: ${JSON.stringify(dimensions)}`,
  );
}

async function accessibilityBoundsByName(page, name) {
  const client = await page.createCDPSession();
  try {
    const { nodes } = await client.send("Accessibility.getFullAXTree");
    const matchingNodes = nodes.filter(
      (node) => node.name?.value === name && node.backendDOMNodeId,
    );
    const bounds = [];
    for (const node of matchingNodes) {
      try {
        const { model } = await client.send("DOM.getBoxModel", {
          backendNodeId: node.backendDOMNodeId,
        });
        const xs = model.border.filter((_, index) => index % 2 === 0);
        const ys = model.border.filter((_, index) => index % 2 === 1);
        bounds.push({
          height: Math.max(...ys) - Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
        });
      } catch {
        // Ignore accessibility-only nodes that do not have a layout box.
      }
    }
    return bounds;
  } finally {
    await client.detach();
  }
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
      { timeout: smokeTimeoutMs },
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

    const popup = await newSmokePage(browser);
    await popup.setViewport({ width: 420, height: 640 });
    const popupErrors = [];
    popup.on("pageerror", (error) => popupErrors.push(error.message));
    await popup.goto(
      `chrome-extension://${extensionId}/extension-options.html`,
      { waitUntil: "domcontentloaded" },
    );
    await popup.waitForFunction(() =>
      document.querySelector("h1")?.textContent.includes("Your highlights"),
    );
    await capture(popup, "popup-login");
    await assertAccessibleControls(popup);
    await assertNoHorizontalOverflow(popup);
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
    await popup.waitForFunction(() =>
      document
        .querySelector("h1")
        ?.textContent.includes("private reading memory"),
    );
    await popup.goto(
      `chrome-extension://${extensionId}/extension-options.html`,
      { waitUntil: "domcontentloaded" },
    );
    await popup.waitForFunction(() =>
      document.querySelector("h1")?.textContent.includes("Your highlights"),
    );
    await popup.type("#login-username", "smoke-user");
    await popup.type("#login-password", "smoke-password");
    await popup.click('button[type="submit"]');
    await popup.waitForFunction(() =>
      document.body.textContent.includes("Open your library"),
    );
    await capture(popup, "popup-account");
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
      "smoke-jwt",
    );
    assert.equal(authenticatedStorage.local["notelix-auth"].server, baseUrl);
    assert.equal(authenticatedStorage.sync.notelix.notelixUser, undefined);
    assert.equal(authenticatedStorage.sync.notelix.notelixPassword, undefined);
    assert.equal(
      JSON.stringify(authenticatedStorage).includes("smoke-password"),
      false,
    );

    await popup.evaluate(
      () =>
        new Promise((resolve) => {
          chrome.storage.local.set(
            { "notelix-encryption-key": "smoke-encryption-key" },
            resolve,
          );
        }),
    );
    await popup.goto(
      `chrome-extension://${extensionId}/extension-options.html#/login`,
      { waitUntil: "domcontentloaded" },
    );
    await popup.waitForFunction(() =>
      document.querySelector("h1")?.textContent.includes("Your highlights"),
    );
    await popup.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent.trim() === "Change")
        .click(),
    );
    await popup.waitForFunction(() =>
      document.querySelector("h1")?.textContent.includes("Choose where"),
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
      undefined,
    );
    assert.equal(serverChangeStorage.sync.notelix.notelixServer, undefined);
    await popup.click("#server-address");
    await popup.keyboard.down("Control");
    await popup.keyboard.press("A");
    await popup.keyboard.up("Control");
    await popup.type("#server-address", baseUrl);
    assert.equal(
      await popup.$eval("#server-address", (input) => input.value),
      baseUrl,
    );
    await popup.click('button[type="submit"]');
    await popup.waitForFunction(() =>
      document.querySelector("h1")?.textContent.includes("Your highlights"),
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
            resolve,
          );
        }),
      baseUrl,
    );

    const responses = await popup.evaluate(async (baseUrl) => {
      const send = (url) =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { cmd: "apiCall", params: { method: "GET", url } },
            resolve,
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

    const appPage = await newSmokePage(browser);
    const appErrors = [];
    appPage.on("pageerror", (error) => appErrors.push(error.message));
    await appPage.setViewport({ width: 1365, height: 900 });
    await appPage.goto(`chrome-extension://${extensionId}/app.html`, {
      waitUntil: "domcontentloaded",
    });
    await appPage.waitForFunction(
      () =>
        document.querySelector(".library h1")?.textContent ===
          "Your reading memory" &&
        document.body.textContent.includes("annotate me"),
    );
    await capture(appPage, "extension-library");
    await assertAccessibleControls(appPage);
    await assertNoHorizontalOverflow(appPage);
    assert.equal(
      await appPage.$eval(
        ".library-browser",
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
      3,
    );
    await appPage.click('button[aria-label^="Use dark theme"]');
    assert.equal(
      await appPage.evaluate(() => document.documentElement.dataset.theme),
      "dark",
    );
    await appPage.type(
      'input[aria-label="Search highlights and notes"]',
      "annotate",
    );
    await appPage.waitForFunction(
      () =>
        document.querySelector(".app-search-results .annotation-card") &&
        document.body.textContent.includes("1 found"),
    );
    await appPage.click(".app-search-results .annotation-card__delete");
    await appPage.waitForSelector(".nl-dialog[role=dialog]");
    assert.equal(
      await appPage.$eval(".nl-dialog h2", (element) => element.textContent),
      "Delete this highlight?",
    );
    await appPage.click(".nl-dialog .nl-button--secondary");
    await appPage.click(
      '.app-search__control button[aria-label="Clear search"]',
    );
    await appPage.setViewport({ width: 390, height: 844 });
    await appPage.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".library-mobile-select"))
          .display !== "none",
    );
    await assertNoHorizontalOverflow(appPage);
    await capture(appPage, "extension-library-mobile");
    assert.deepEqual(appErrors, []);

    const contentPage = await newSmokePage(browser);
    const contentErrors = [];
    contentPage.on("pageerror", (error) => contentErrors.push(error.message));
    await contentPage.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "domcontentloaded",
    });
    await contentPage.waitForSelector("body.notelix-initialized");
    await contentPage.waitForSelector(
      'web-marker-highlight[highlight-id="smoke-annotation"]',
    );
    await contentPage.waitForSelector("#notes-smoke-annotation");
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
    const inlineNoteGeometry = await contentPage.$eval(
      "#notes-smoke-annotation",
      (host) => {
        const style = getComputedStyle(host);
        const rect = host.getBoundingClientRect();
        const highlights = [
          ...document.querySelectorAll(
            'web-marker-highlight[highlight-id="smoke-annotation"]',
          ),
        ];
        return {
          backgroundColor: style.backgroundColor,
          borderWidth: style.borderWidth,
          boxShadow: style.boxShadow,
          display: style.display,
          height: rect.height,
          isAtHighlightEnd:
            host.parentElement === highlights[highlights.length - 1] &&
            host.parentElement.lastChild === host,
          marginLeft: style.marginLeft,
          padding: style.padding,
          position: style.position,
          top: style.top,
          verticalAlign: style.verticalAlign,
          width: rect.width,
        };
      },
    );
    assert.deepEqual(inlineNoteGeometry, {
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderWidth: "0px",
      boxShadow: "none",
      display: "inline-block",
      height: 16,
      isAtHighlightEnd: true,
      marginLeft: "3px",
      padding: "0px",
      position: "relative",
      top: "-1px",
      verticalAlign: "text-top",
      width: 16,
    });
    const embeddedControlStyle = await contentPage.evaluate(() => {
      const annotate = document.getElementById("notelix-annotate-popover");
      const edit = document.getElementById("notelix-edit-annotation-popover");
      const buttons = [...edit.querySelectorAll("button")];
      return {
        annotateBackground: getComputedStyle(annotate).backgroundColor,
        annotateLabel: annotate.getAttribute("aria-label"),
        annotateText: annotate.innerText.trim(),
        buttonLabels: buttons.map((button) =>
          button.getAttribute("aria-label"),
        ),
        buttonOrder: buttons.map((button) => button.id),
        editBackground: getComputedStyle(edit).backgroundColor,
        editText: edit.innerText.trim(),
      };
    });
    assert.deepEqual(embeddedControlStyle, {
      annotateBackground: "rgba(255, 255, 255, 0.96)",
      annotateLabel: "Highlight colors",
      annotateText: "",
      buttonLabels: ["Delete highlight", "Edit note"],
      buttonOrder: ["notelix-button-trash", "notelix-button-notes"],
      editBackground: "rgba(255, 255, 255, 0.96)",
      editText: "",
    });
    await contentPage.hover("#notes-smoke-annotation");
    const inlineNoteTextBounds = await waitForValue(
      () => accessibilityBoundsByName(contentPage, privateNote),
      (bounds) => bounds.length >= 1,
      "the inline note preview to reach the accessibility tree",
    );
    assert.ok(
      inlineNoteTextBounds.every(({ width }) => width <= 322),
      `inline note preview is too wide: ${JSON.stringify(inlineNoteTextBounds)}`,
    );
    await capture(contentPage, "embedded-content-note-preview");
    await contentPage.mouse.move(0, 0);
    await capture(contentPage, "embedded-content-note");

    const syntheticHighlightDisplay = await contentPage.evaluate(async () => {
      document
        .querySelector('web-marker-highlight[highlight-id="smoke-annotation"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      return getComputedStyle(
        document.getElementById("notelix-edit-annotation-popover"),
      ).display;
    });
    assert.equal(syntheticHighlightDisplay, "none");

    const mutatingRequestsBeforeSyntheticEvents = annotationRequests.filter(
      (request) => request.url !== "/annotations/queryByUrl",
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
        "notelix-annotate-popover",
      );
      annotatePopover.style.display = "flex";
      annotatePopover
        .querySelector(".color")
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      window.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, code: "Digit1" }),
      );

      const editPopover = document.getElementById(
        "notelix-edit-annotation-popover",
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
        (request) => request.url !== "/annotations/queryByUrl",
      ).length,
      mutatingRequestsBeforeSyntheticEvents,
    );

    await contentPage.evaluate(() => {
      document.getElementById("notelix-edit-annotation-popover").style.display =
        "none";
    });
    await contentPage.click(
      'web-marker-highlight[highlight-id="smoke-annotation"]',
    );
    await contentPage.waitForFunction(
      () =>
        getComputedStyle(
          document.getElementById("notelix-edit-annotation-popover"),
        ).display === "flex",
    );
    await capture(contentPage, "embedded-content-actions");
    const trustedDialogs = [];
    const trustedDialogHandler = async (dialog) => {
      trustedDialogs.push(dialog.type());
      await dialog.dismiss();
    };
    contentPage.on("dialog", trustedDialogHandler);
    await contentPage.click("#notelix-button-notes");
    await contentPage.waitForFunction(() =>
      document
        .getElementById("notelix-notes-backdrop")
        .classList.contains("notelix-dialog-visible"),
    );
    const privateEditorState = await contentPage.evaluate((secret) => {
      const host = document.getElementById("notelix-notes-backdrop");
      return {
        bodyTextContainsSecret: document.body.textContent.includes(secret),
        htmlContainsSecret: document.documentElement.innerHTML.includes(secret),
        shadowRoot: host.shadowRoot,
        ariaHidden: host.getAttribute("aria-hidden"),
      };
    }, privateNote);
    assert.deepEqual(privateEditorState, {
      bodyTextContainsSecret: false,
      htmlContainsSecret: false,
      shadowRoot: null,
      ariaHidden: "false",
    });
    assert.deepEqual(
      await contentPage.$eval("#notelix-notes-backdrop", (host) => ({
        accent: host.style.getPropertyValue("--notelix-dialog-accent"),
        accentForeground: host.style.getPropertyValue(
          "--notelix-dialog-accent-foreground",
        ),
        accentSoft: host.style.getPropertyValue(
          "--notelix-dialog-accent-soft",
        ),
      })),
      {
        accent: "#fff59d",
        accentForeground: "#000000",
        accentSoft: "#fff59d33",
      },
    );
    await capture(contentPage, "embedded-content-note-editor");
    const editorAccessibility = JSON.stringify(
      await contentPage.accessibility.snapshot({ interestingOnly: false }),
    );
    assert.equal(editorAccessibility.includes("Edit note"), true);
    assert.equal(
      editorAccessibility.includes("Add context to this highlight"),
      false,
    );
    await contentPage.keyboard.press("Escape");
    await contentPage.waitForFunction(
      () =>
        document
          .getElementById("notelix-notes-backdrop")
          .getAttribute("aria-hidden") === "true",
    );
    await contentPage.click(
      'web-marker-highlight[highlight-id="smoke-annotation"]',
    );
    await contentPage.waitForFunction(
      () =>
        getComputedStyle(
          document.getElementById("notelix-edit-annotation-popover"),
        ).display === "flex",
    );
    await contentPage.click("#notelix-button-notes");
    await contentPage.waitForFunction(() =>
      document
        .getElementById("notelix-notes-backdrop")
        .matches(":focus-within"),
    );
    const updatedPrivateNote = `${privateNote} updated`;
    await contentPage.keyboard.down("Control");
    await contentPage.keyboard.press("A");
    await contentPage.keyboard.up("Control");
    await contentPage.keyboard.type(updatedPrivateNote);
    await contentPage.keyboard.press("Tab");
    await contentPage.keyboard.press("Tab");
    await contentPage.keyboard.press("Enter");
    await contentPage.waitForFunction(
      () =>
        document
          .getElementById("notelix-notes-backdrop")
          .getAttribute("aria-hidden") === "true",
    );
    const noteSaveRequest = annotationRequests.find(
      (request) =>
        request.url === "/annotations/save" &&
        request.body?.uid === "smoke-annotation",
    );
    assert.equal(noteSaveRequest.body.id, undefined);
    assert.equal(noteSaveRequest.body.data.notes, updatedPrivateNote);
    await contentPage.click(
      'web-marker-highlight[highlight-id="smoke-annotation"]',
    );
    await contentPage.waitForFunction(
      () =>
        getComputedStyle(
          document.getElementById("notelix-edit-annotation-popover"),
        ).display === "flex",
    );
    await contentPage.click("#notelix-button-trash");
    await contentPage.waitForFunction(() =>
      document
        .getElementById("notelix-delete-backdrop")
        .classList.contains("notelix-dialog-visible"),
    );
    await contentPage.waitForFunction(() =>
      document
        .getElementById("notelix-delete-backdrop")
        .matches(":focus-within"),
    );
    assert.equal(
      await contentPage.$eval(
        "#notelix-delete-backdrop",
        (host) => host.shadowRoot,
      ),
      null,
    );
    await contentPage.keyboard.press("Tab");
    await contentPage.keyboard.press("Enter");
    await contentPage.waitForFunction(
      () =>
        !document.querySelector(
          'web-marker-highlight[highlight-id="smoke-annotation"]',
        ),
    );
    const deleteRequest = annotationRequests.find(
      (request) => request.url === "/annotations/delete",
    );
    assert.deepEqual(deleteRequest, {
      method: "POST",
      url: "/annotations/delete",
      body: { uid: "smoke-annotation" },
    });
    contentPage.off("dialog", trustedDialogHandler);
    assert.deepEqual(trustedDialogs, []);
    assert.deepEqual(contentErrors, []);

    const customizedLightPage = await newSmokePage(browser);
    await customizedLightPage.goto(`${baseUrl}/customized-embedded-light`, {
      waitUntil: "domcontentloaded",
    });
    await customizedLightPage.waitForSelector("body.notelix-initialized");
    const customizedLightState = await customizedLightPage.evaluate(() => {
      const annotate = document.getElementById("notelix-annotate-popover");
      const edit = document.getElementById("notelix-edit-annotation-popover");
      const notes = document.getElementById("notelix-notes-backdrop");
      notes.classList.add("notelix-dialog-visible");
      notes.setAttribute("aria-hidden", "false");
      return {
        annotateBackground: getComputedStyle(annotate).backgroundColor,
        annotateLabel: annotate.getAttribute("aria-label"),
        buttonLabels: [...edit.querySelectorAll("button")].map((button) =>
          button.getAttribute("aria-label"),
        ),
        darkClasses: [annotate, edit, notes].map((element) =>
          element.classList.contains("dark-reader-enabled"),
        ),
      };
    });
    assert.deepEqual(customizedLightState, {
      annotateBackground: "rgba(255, 255, 255, 0.96)",
      annotateLabel: "选择高亮颜色",
      buttonLabels: ["删除高亮", "编辑笔记"],
      darkClasses: [false, false, false],
    });
    const customizedLightAccessibility = JSON.stringify(
      await customizedLightPage.accessibility.snapshot({
        interestingOnly: false,
      }),
    );
    assert.equal(customizedLightAccessibility.includes("编辑笔记"), true);
    assert.equal(customizedLightAccessibility.includes("笔记内容"), true);

    const customizedDarkPage = await newSmokePage(browser);
    await customizedDarkPage.goto(`${baseUrl}/customized-embedded-dark`, {
      waitUntil: "domcontentloaded",
    });
    await customizedDarkPage.waitForSelector("body.notelix-initialized");
    const customizedDarkState = await customizedDarkPage.evaluate(() => {
      const annotate = document.getElementById("notelix-annotate-popover");
      const edit = document.getElementById("notelix-edit-annotation-popover");
      const notes = document.getElementById("notelix-notes-backdrop");
      return {
        annotateBackground: getComputedStyle(annotate).backgroundColor,
        annotateLabel: annotate.getAttribute("aria-label"),
        buttonLabels: [...edit.querySelectorAll("button")].map((button) =>
          button.getAttribute("aria-label"),
        ),
        darkClasses: [annotate, edit, notes].map((element) =>
          element.classList.contains("dark-reader-enabled"),
        ),
      };
    });
    assert.deepEqual(customizedDarkState, {
      annotateBackground: "rgba(36, 36, 36, 0.96)",
      annotateLabel: "Highlight colors",
      buttonLabels: ["Delete highlight", "Edit note"],
      darkClasses: [true, true, true],
    });

    const embeddedPage = await newSmokePage(browser);
    await embeddedPage.setViewport({ width: 1280, height: 900 });
    await embeddedPage.setRequestInterception(true);
    embeddedPage.on("request", (request) => {
      if (request.url().startsWith(baseUrl)) {
        request.continue();
      } else {
        request.abort();
      }
    });
    const annotationRequestsBeforeEmbedded = annotationRequests.length;
    const initialDemoQuery = embeddedPage.waitForResponse((response) =>
      response.url().endsWith("/annotations/queryByUrl"),
    );
    await embeddedPage.goto(`${baseUrl}/embedded`, {
      waitUntil: "domcontentloaded",
    });
    await embeddedPage.waitForSelector("body.notelix-initialized");
    await initialDemoQuery;
    const firstDemoToken = await embeddedPage.evaluate(
      () => window.NotelixEmbeddedConfig.staticToken,
    );
    assert.equal(firstDemoToken, sharedDemoToken);
    assert.equal(
      await embeddedPage.evaluate(
        () => window.NotelixEmbeddedConfig.demoLocalOnly,
      ),
      false,
    );
    assert.equal(
      await embeddedPage.$eval(".demo-privacy strong", (element) =>
        element.textContent.trim(),
      ),
      "Shared public playground",
    );
    assert.ok(annotationRequests.length > annotationRequestsBeforeEmbedded);

    await embeddedPage.evaluate(() => {
      const paragraph = [...document.querySelectorAll(".demo-article p")].find(
        (element) => element.textContent.includes("There is a particular kind"),
      );
      const range = document.createRange();
      range.setStart(paragraph.firstChild, 0);
      range.setEnd(paragraph.firstChild, 70);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    });
    await embeddedPage.waitForFunction(
      () =>
        getComputedStyle(document.getElementById("notelix-annotate-popover"))
          .display === "flex" &&
        !document.body.classList.contains("selection-changing"),
    );
    const colorPosition = await embeddedPage.$eval(
      "#notelix-annotate-popover .color",
      (element) => {
        const bounds = element.getBoundingClientRect();
        return {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        };
      },
    );
    await embeddedPage.mouse.click(colorPosition.x, colorPosition.y);
    await embeddedPage.waitForSelector("web-marker-highlight");
    const highlightGeometry = await embeddedPage.$$eval(
      "web-marker-highlight",
      (elements) => {
        const firstBounds = elements[0].getBoundingClientRect();
        const endpointBounds =
          elements[elements.length - 1].getBoundingClientRect();
        return {
          click: {
            x: firstBounds.left + Math.min(4, firstBounds.width / 4),
            y: firstBounds.top + firstBounds.height / 2,
          },
          endpoint: {
            bottom: endpointBounds.bottom,
            right: endpointBounds.right,
          },
        };
      },
    );
    const layoutBeforeNote = await embeddedPage.$eval(
      "web-marker-highlight",
      (highlight) => {
        const paragraph = highlight.closest("p");
        const bounds = paragraph.getBoundingClientRect();
        return { height: bounds.height, top: bounds.top };
      },
    );
    await embeddedPage.mouse.click(
      highlightGeometry.click.x,
      highlightGeometry.click.y,
    );
    await embeddedPage.waitForFunction(
      () =>
        getComputedStyle(
          document.getElementById("notelix-edit-annotation-popover"),
        ).display === "flex",
    );
    const actionPopoverPlacement = await embeddedPage.$eval(
      "#notelix-edit-annotation-popover",
      (element) => {
        const bounds = element.getBoundingClientRect();
        return {
          placement: element.dataset.notelixPlacement,
          right: bounds.right,
          top: bounds.top,
        };
      },
    );
    assert.equal(actionPopoverPlacement.placement, "below");
    assert.ok(
      Math.abs(
        actionPopoverPlacement.right - highlightGeometry.endpoint.right,
      ) <= 1,
      "the highlight action popover should align with the highlight endpoint",
    );
    assert.ok(
      actionPopoverPlacement.top - highlightGeometry.endpoint.bottom >= 8 &&
        actionPopoverPlacement.top - highlightGeometry.endpoint.bottom <= 11,
      "the highlight action popover should remain close to the highlight endpoint",
    );
    assert.ok(
      Math.abs(highlightGeometry.endpoint.right - highlightGeometry.click.x) >
        20,
      "the smoke test should click far enough from the endpoint to catch pointer anchoring",
    );
    await embeddedPage.click("#notelix-button-notes");
    await embeddedPage.waitForFunction(() =>
      document
        .getElementById("notelix-notes-backdrop")
        .matches(".notelix-dialog-visible:focus-within"),
    );
    const sharedNote = "shared demo note survives every device";
    await embeddedPage.keyboard.type(sharedNote);
    const sharedNoteSave = embeddedPage.waitForResponse(
      (response) => {
        if (
          !response.url().endsWith("/annotations/save") ||
          response.request().method() !== "POST"
        ) {
          return false;
        }
        try {
          const payload = JSON.parse(response.request().postData() || "{}");
          return payload.data?.notes === sharedNote;
        } catch {
          return false;
        }
      },
    );
    await embeddedPage.keyboard.press("Tab");
    await embeddedPage.keyboard.press("Tab");
    await embeddedPage.keyboard.press("Enter");
    await sharedNoteSave;
    await embeddedPage.waitForSelector(".notelix-notes-inline");
    assert.equal(
      await embeddedPage.$eval(".notelix-notes-inline", async (host) => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        return host.isConnected && document.getElementById(host.id) === host;
      }),
      true,
      "the inline note badge should remain connected after painting settles",
    );
    const savedNoteId = await embeddedPage.$eval(
      ".notelix-notes-inline",
      (element) => element.id,
    );
    const layoutAfterNote = await embeddedPage.$eval(
      "web-marker-highlight",
      (highlight) => {
        const paragraph = highlight.closest("p");
        const bounds = paragraph.getBoundingClientRect();
        return { height: bounds.height, top: bounds.top };
      },
    );
    assert.deepEqual(layoutAfterNote, layoutBeforeNote);
    assert.equal(
      [...demoAnnotations.values()].some(
        (annotation) => annotation.data.notes === sharedNote,
      ),
      true,
    );
    await capture(embeddedPage, "embedded-playground-with-note", {
      fullPage: true,
    });

    await embeddedPage.reload({ waitUntil: "domcontentloaded" });
    await embeddedPage.waitForSelector(`#${savedNoteId}`);
    assert.equal(
      await embeddedPage.evaluate(
        () => window.NotelixEmbeddedConfig.staticToken,
      ),
      firstDemoToken,
    );

    const secondDeviceContext = await browser.createBrowserContext();
    const secondDevicePage = await newSmokePage(secondDeviceContext);
    await secondDevicePage.goto(`${baseUrl}/embedded`, {
      waitUntil: "domcontentloaded",
    });
    await secondDevicePage.waitForSelector(`#${savedNoteId}`);
    assert.equal(
      await secondDevicePage.evaluate(
        () => window.NotelixEmbeddedConfig.staticToken,
      ),
      firstDemoToken,
    );
    await secondDeviceContext.close();
    await capture(embeddedPage, "embedded-playground", { fullPage: true });

    const productPage = await newSmokePage(browser);
    await productPage.setViewport({ width: 1440, height: 1000 });
    const productErrors = [];
    productPage.on("pageerror", (error) => productErrors.push(error.message));
    await productPage.goto(`${baseUrl}/product`, {
      waitUntil: "networkidle0",
    });
    assert.equal(
      await productPage.$eval("h1", (element) =>
        element.textContent.includes("Remember the ideas"),
      ),
      true,
    );
    assert.deepEqual(productErrors, []);
    await capture(productPage, "product-website", { fullPage: true });
    await assertAccessibleControls(productPage);
    await assertNoHorizontalOverflow(productPage);
    await productPage.setViewport({ width: 390, height: 844 });
    await productPage.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("[data-nav-toggle]"))
          .display !== "none",
    );
    await productPage.click("[data-nav-toggle]");
    assert.equal(
      await productPage.$eval("[data-nav-toggle]", (element) =>
        element.getAttribute("aria-expanded"),
      ),
      "true",
    );
    await assertNoHorizontalOverflow(productPage);
    await capture(productPage, "product-website-mobile");

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
  if (process.env.GITHUB_ACTIONS === "true") {
    const details = (error?.stack || String(error))
      .replace(/%/g, "%25")
      .replace(/\r/g, "%0D")
      .replace(/\n/g, "%0A");
    console.error(`::error title=Chrome extension smoke failed::${details}`);
  }
  process.exitCode = 1;
});
