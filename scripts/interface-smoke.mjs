import { chromium } from "playwright";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

// Serve the actual production bundle. No live accounts or third-party music are needed.
const root = path.resolve("dist");
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  let file = path.resolve(
    root,
    "." + (pathname === "/" ? "/index.html" : pathname),
  );
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file))
    file = path.join(root, "index.html");
  res.setHeader(
    "Content-Type",
    {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
      ".jpg": "image/jpeg",
    }[path.extname(file)] || "application/octet-stream",
  );
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: "chrome" }),
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "dark",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/music/**", (route) =>
  route.fulfill({ status: 404, json: { detail: "Offline fixture" } }),
);
await page.route("https://lrclib.net/**", (route) =>
  route.fulfill({ json: [] }),
);
const screenshot = async (name) => {
  if (!process.env.UI_SCREENSHOTS_DIR) return;
  fs.mkdirSync(process.env.UI_SCREENSHOTS_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(process.env.UI_SCREENSHOTS_DIR, name + ".png"),
    fullPage: true,
  });
};
const openSettings = async () => {
  if (!(await page.locator("#app-settings").isVisible()))
    await page.locator(".app-header .settings-trigger").click();
};
const closeSettings = async () => {
  if (await page.locator(".settings-close").isVisible())
    await page.locator(".settings-close").click();
};
const assertFits = async (label) => {
  const issues = await page.evaluate(() => {
    const problems = [];
    if (document.documentElement.scrollWidth > innerWidth + 2)
      problems.push("page overflow");
    for (const el of document.querySelectorAll(
      ".settings-page:not([hidden]),.settings-pages,.source-modal,.spotify-player-card",
    )) {
      if (el.getClientRects().length && el.scrollWidth > el.clientWidth + 2)
        problems.push(el.className + " overflow");
    }
    for (const el of document.querySelectorAll(
      ".settings-page:not([hidden]) button,.settings-page:not([hidden]) input,.settings-page:not([hidden]) select,.source-modal button",
    )) {
      if (!el.getClientRects().length) continue;
      const rect = el.getBoundingClientRect();
      const container = el
        .closest(".settings-page,.source-modal")
        ?.getBoundingClientRect();
      if (
        container &&
        (rect.left < container.left - 2 || rect.right > container.right + 2)
      )
        problems.push(
          el.getAttribute("aria-label") || el.textContent.slice(0, 60),
        );
    }
    return problems;
  });
  assert.deepEqual(issues, [], label);
};
try {
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.locator("canvas.cinematic-canvas").waitFor();
  await page.waitForFunction(
    () =>
      Number(document.querySelector(".cinematic-canvas")?.dataset.frame) > 0 ||
      document.querySelector(".cinematic-canvas")?.dataset.fps !== undefined,
  );
  assert.equal(await page.locator("audio").count(), 1);
  assert.equal(await page.locator(".spotify-player-card").count(), 1);
  const expectedTabs = [
    "Song Mapping",
    "Background",
    "Lyrics",
    "Render Engine",
    "Others",
  ];
  for (const theme of ["Dark", "Light"]) {
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await openSettings();
      await page.getByRole("tab", { name: "Others", exact: true }).click();
      await page.getByRole("button", { name: theme, exact: true }).click();
      assert.equal(
        await page.locator(".shell").getAttribute("data-theme"),
        theme.toLowerCase(),
      );
      assert.deepEqual(
        await page.getByRole("tab").allTextContents(),
        expectedTabs,
      );
      for (const tab of expectedTabs) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        // Expanding every advanced area catches layout errors hidden by the compact defaults.
        await page
          .locator(".settings-page:not([hidden]) details")
          .evaluateAll((nodes) =>
            nodes.forEach((el) => {
              el.open = true;
            }),
          );
        await assertFits(`${theme}, ${width}px, ${tab}`);
        await page
          .locator(".settings-page:not([hidden]) details")
          .evaluateAll((nodes) =>
            nodes.forEach((el) => {
              el.open = false;
            }),
          );
      }
      if (width === 390) {
        await page.locator(".youtube-account-control>button").click();
        if (
          await page
            .getByRole("button", { name: "Advanced connection", exact: true })
            .count()
        )
          await page
            .getByRole("button", { name: "Advanced connection", exact: true })
            .click();
        await assertFits(`${theme}, YouTube account controls`);
        await page
          .locator(".youtube-auth-panel")
          .getByRole("button", { name: "Close", exact: true })
          .click();
      }
      await closeSettings();
      await assertFits(`${theme}, ${width}px, player`);
      if ([390, 1440].includes(width))
        await screenshot(`${theme.toLowerCase()}-${width}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Select source", exact: true })
    .click();
  assert.equal(
    await page.getByRole("dialog", { name: "Choose audio source" }).count(),
    1,
  );
  await assertFits("mobile source dialog");
  await screenshot("mobile-sources");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".source-modal").count(), 0);
  assert.equal(
    await page
      .locator(".yt-player-actions-bar button:nth-of-type(2)")
      .evaluate((el) => el === document.activeElement),
    true,
  );

  // Load and decode a real local audio file, including a title longer than the player width.
  const rate = 8000,
    frames = rate * 6,
    wav = Buffer.alloc(44 + frames * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(frames * 2, 40);
  for (let n = 0; n < frames; n++)
    wav.writeInt16LE(
      Math.round(Math.sin((n * 2 * Math.PI * 220) / rate) * 2000),
      44 + n * 2,
    );
  await page
    .getByLabel("Select local audio file")
    .setInputFiles({
      name: "An Artist With A Very Long Name - A beautifully long song title that should wrap without hiding playback controls.wav",
      mimeType: "audio/wav",
      buffer: wav,
    });
  await page.getByRole("button", { name: "Play track", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("audio").currentTime > 0.1,
  );
  await page.getByRole("button", { name: "Pause track", exact: true }).click();
  await assertFits("long track title");
  await openSettings();
  await page.getByRole("tab", { name: "Song Mapping", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit or import lyrics", exact: true })
    .click();
  await page
    .getByLabel("Import LRC or TTML file")
    .setInputFiles({
      name: "fixture.lrc",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "[00:00.00]A line that stays with the music\n[00:03.00]Another line, another moment",
      ),
    });
  await page.getByLabel("Lyrics delay seconds", { exact: true }).fill("-1.25");
  await page
    .getByRole("button", { name: "Save for current song", exact: true })
    .click();
  await page.getByRole("tab", { name: "Lyrics", exact: true }).click();
  await page.getByLabel("Lyrics font size scale").press("ArrowRight");
  await page.getByRole("tab", { name: "Song Mapping", exact: true }).click();
  assert.equal(
    await page.getByLabel("Lyrics delay seconds", { exact: true }).inputValue(),
    "-1.25",
  );
  assert.ok(
    await page
      .locator(".lyrics-editor textarea")
      .first()
      .inputValue()
      .then((t) => t.includes("A line that stays")),
  );
  await assertFits("song mapping and custom editor");
  await screenshot("mobile-song-mapping");
  await closeSettings();
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await page.locator(".performance-mode").waitFor();
  assert.equal(
    await page.locator("audio").count(),
    1,
    "Fullscreen reuses the same player",
  );
  await page
    .locator(".fullscreen-toolbar")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await assertFits("fullscreen settings");
  await page.getByRole("tab", { name: "Others", exact: true }).click();
  await page.getByLabel("Show FPS on visualizer").check();
  assert.equal(await page.locator(".fps-badge").count(), 1);
  await closeSettings();
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await page.locator(".shell:not(.performance-mode)").waitFor();
  await assertFits("fullscreen exit");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 12 screen/theme combinations, all five settings pages and expanded controls, account and source dialogs, long titles, real local playback, song mapping and saving, lyric continuity, fullscreen reuse, FPS, keyboard dismissal, and no page errors.",
  );
} finally {
  await browser.close();
  server.close();
}
