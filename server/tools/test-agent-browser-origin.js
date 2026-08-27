const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const executablePath = process.argv[2] || process.env.CHROME_PATH;
if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error('pass a Chrome executable path or set CHROME_PATH');
}

const puppeteerPath = path.resolve(
  __dirname,
  '../../chrome-extension/node_modules/puppeteer-core',
);
if (!fs.existsSync(puppeteerPath)) {
  throw new Error(
    'chrome-extension dependencies are required for the agent browser test',
  );
}
const { launch } = require(puppeteerPath);
const agentServerUrl = new URL(
  process.env.TEST_AGENT_SERVER_URL || 'http://127.0.0.1:18579',
);

async function main() {
  const fixtureDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'notelix-untrusted-extension-'),
  );
  const profileDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'notelix-agent-browser-profile-'),
  );
  fs.writeFileSync(
    path.join(fixtureDirectory, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'Notelix agent isolation probe',
      version: '1.0.0',
      host_permissions: [`${agentServerUrl.origin}/*`],
      background: { service_worker: 'worker.js' },
    }),
  );
  fs.writeFileSync(
    path.join(fixtureDirectory, 'worker.js'),
    'chrome.runtime.onInstalled.addListener(() => undefined);\n',
  );

  let browser;
  try {
    browser = await launch({
      executablePath,
      headless: true,
      enableExtensions: true,
      userDataDir: profileDirectory,
      args: [
        `--disable-extensions-except=${fixtureDirectory}`,
        `--load-extension=${fixtureDirectory}`,
        '--no-first-run',
        '--no-sandbox',
      ],
    });
    const workerTarget = await browser.waitForTarget(
      (target) =>
        target.type() === 'service_worker' &&
        target.url().startsWith('chrome-extension://'),
      { timeout: 15000 },
    );
    const extensionOrigin = `chrome-extension://${new URL(workerTarget.url()).host}`;
    assert.notEqual(extensionOrigin, 'chrome-extension://integration-test');
    const worker = await workerTarget.worker();

    for (const [pathname, body] of [
      ['/annotations/search', { q: 'agentsearchrecoverymarker' }],
      ['/annotations/find', { selectors: { uid: 'agent-search-recovery' } }],
    ]) {
      const response = await worker.evaluate(
        async (url, requestBody) => {
          const result = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });
          return { status: result.status, body: await result.json() };
        },
        new URL(pathname, agentServerUrl).toString(),
        body,
      );
      assert.equal(response.status, 403, JSON.stringify(response.body));
      assert.equal(
        response.body.message,
        'origin is not allowed to access the agent',
      );
    }
    console.log('Untrusted Chrome extension agent isolation test passed.');
  } finally {
    await browser?.close();
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
    fs.rmSync(profileDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
