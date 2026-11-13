const { expect, test } = require('../support/launch-app');
const { sheetCase } = require('../support/sheet');

/** Runs `code` in the overlay window's preview (the OBS page in a webview). */
async function inPreview(app, code) {
  return app.evaluate(async ({ webContents }, script) => {
    const preview = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().includes('?preview'));
    if (!preview || preview.isDestroyed()) return null;
    return preview.executeJavaScript(script);
  }, code);
}

test.describe('Bani Overlay', () => {
  test(
    sheetCase('OVERLAY-01', 'The Bani Overlay window opens with its controls'),
    async ({ app, main, openOverlay }) => {
      const overlay = await openOverlay();
      await expect(overlay.locator('.control-panel')).toBeVisible();
      await expect(overlay.locator('.overlay-url')).toBeVisible();
      expect(await overlay.locator('.layout-btn').count()).toBe(5);
      expect(await overlay.locator('input[type="color"]').count()).toBeGreaterThanOrEqual(3);
      // The live URL points at this machine's overlay server.
      const port = await app.evaluate(() => global.overlayPort);
      expect(port).toBeGreaterThan(0);
      const urlBox = overlay.locator('.overlay-url .url-text');
      await expect(urlBox).toHaveValue(/^http:\/\/[\d.]+:\d+\/$/, { timeout: 10000 });
      expect(await urlBox.inputValue()).toContain(`:${port}/`);
      expect(main.isClosed()).toBe(false);
    },
  );

  test(
    sheetCase('OVERLAY-02', 'Text can be resized and recoloured'),
    async ({ app, openOverlay }) => {
      const overlay = await openOverlay();
      await expect(overlay.locator('webview.preview')).toBeVisible();
      const previewColour = () =>
        inPreview(app, "getComputedStyle(document.querySelector('.layout-top-bottom')).color");
      await expect.poll(previewColour, { timeout: 10000 }).toMatch(/rgb/);
      const before = await previewColour();
      // The text colour reaches the preview.
      const colour = overlay.locator('#text-color input[type="color"]');
      await colour.fill('#ff0000');
      await expect(colour).toHaveValue('#ff0000');
      await expect.poll(previewColour, { timeout: 10000 }).toBe('rgb(255, 0, 0)');
      // The size icons grow and shrink the text.
      const fontSize = () =>
        inPreview(app, "document.querySelector('.layout-top-bottom').style.fontSize");
      const size = await fontSize();
      await overlay.locator('#text-size .size-icon[data-value="plus"]').click();
      await expect.poll(fontSize, { timeout: 10000 }).not.toBe(size);
      await overlay.locator('#text-size .size-icon[data-value="minus"]').click();
      await expect.poll(fontSize, { timeout: 10000 }).toBe(size);
      // Reset Defaults puts the colour back.
      await overlay.locator('#reset .icon-toggle').click();
      await expect.poll(previewColour, { timeout: 10000 }).toBe(before);
    },
  );

  test(sheetCase('OVERLAY-03', 'The layout can be changed'), async ({ app, openOverlay }) => {
    const overlay = await openOverlay();
    const bodyLayout = () =>
      inPreview(app, "([...document.body.classList].find((c) => c.startsWith('layout-')) || '')");
    await expect.poll(bodyLayout, { timeout: 10000 }).toMatch(/^layout-/);
    for (const name of ['top', 'split', 'vertical', 'classic', 'bottom']) {
      await overlay.locator(`.layout-btn.${name}`).click();
      await expect.poll(bodyLayout, { timeout: 10000 }).toBe(`layout-${name}`);
    }
  });

  test(
    sheetCase('OVERLAY-04', 'The overlay URL serves the OBS page'),
    async ({ app, openOverlay, request }) => {
      // Partial: pasting into OBS is the tester's step; the page OBS would load
      // is fetched and checked here.
      await openOverlay();
      const port = await app.evaluate(() => global.overlayPort);
      const response = await request.get(`http://127.0.0.1:${port}/`);
      expect(response.ok()).toBe(true);
      const html = await response.text();
      expect(html).toContain('socket.io');
      expect(html).toContain('fitty');
    },
  );
});
