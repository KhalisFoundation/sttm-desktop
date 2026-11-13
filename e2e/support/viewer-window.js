// What the viewer shows. With a second display the viewer is its own window;
// on one display it is a <webview> inside the main window, which Playwright
// does not expose as a page. Either way it is a webContents, so it is read
// (and, for Quick Tools, poked) through Electron's main process.
const { expect } = require('@playwright/test');

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A string expectation as a pattern that ignores spacing: the viewer renders words as spans. */
const loose = (text) => new RegExp(escapeRegExp(text).replace(/\s+/g, '\\s*'));

// The slide: one wrapper per line, or the whole deck in Akhand Paatth view.
const SLIDE_TEXT = `(() => {
  const nodes = document.querySelectorAll('.verse-slide-wrapper, .shabad-deck > .verse-slide');
  return Array.from(nodes).map((el) => el.innerText).join('\\n');
})()`;

class ViewerWindow {
  constructor(app) {
    this.app = app;
  }

  /** Runs `code` in the viewer page and returns its result, or null while it has not loaded. */
  async run(code) {
    return this.app.evaluate(async ({ webContents }, script) => {
      const viewer = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL().endsWith('viewer.html'));
      if (!viewer || viewer.isDestroyed()) return null;
      return viewer.executeJavaScript(script);
    }, code);
  }

  /** The slide's visible text (not the Quick Tools strip), or null while it has not loaded. */
  async text() {
    return this.run(SLIDE_TEXT);
  }

  /** Waits until the slide text matches. */
  async expectText(expected, timeout = 15000) {
    await expect
      .poll(async () => (await this.text()) || '', { timeout })
      .toMatch(typeof expected === 'string' ? loose(expected) : expected);
  }

  async expectBlank(timeout = 10000) {
    await expect.poll(async () => ((await this.text()) || '').trim(), { timeout }).toBe('');
  }

  /** Whether the viewer is a separate window (presenter view on a second display). */
  async isSeparateWindow() {
    return this.app.windows().some((window) => window.url().endsWith('viewer.html'));
  }

  /** Class list of the first element matching `selector`, [] when absent. */
  async classes(selector) {
    const value = await this.run(
      `((document.querySelector(${JSON.stringify(selector)}) || {}).className || '')`,
    );
    return (value || '').split(/\s+/).filter(Boolean);
  }

  /** A computed style of the first element matching `selector`. */
  async style(selector, property) {
    const value = await this.run(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); ` +
        `return el ? getComputedStyle(el).getPropertyValue(${JSON.stringify(property)}) : ''; })()`,
    );
    return value || '';
  }

  async count(selector) {
    return (await this.run(`document.querySelectorAll(${JSON.stringify(selector)}).length`)) || 0;
  }

  /** The id of the verse being shown (data-verseid on the slide), or ''. */
  async currentLineId() {
    return (
      (await this.run(
        "((document.querySelector('.verse-slide-wrapper[data-verseid]') || {}).dataset || {}).verseid || ''",
      )) || ''
    );
  }

  /** Clicks the first element matching `selector` inside the viewer. */
  async click(selector) {
    const found = await this.run(
      `(() => { const el = document.querySelector(${JSON.stringify(
        selector,
      )}); if (!el) return false; el.click(); return true; })()`,
    );
    expect(found, `${selector} in the viewer`).toBe(true);
  }

  /** Opens the Quick Tools strip at the top of the viewer. */
  async openQuickTools() {
    if (!(await this.count('.quicktool-body'))) await this.click('.quicktool-header');
    await expect.poll(() => this.count('.quicktool-body'), { timeout: 5000 }).toBeGreaterThan(0);
  }

  /** A PNG of the viewer, for attaching to the report. */
  async screenshot() {
    const base64 = await this.app.evaluate(async ({ webContents }) => {
      const viewer = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL().endsWith('viewer.html'));
      if (!viewer) return '';
      const image = await viewer.capturePage();
      return image.toPNG().toString('base64');
    });
    return Buffer.from(base64, 'base64');
  }
}

module.exports = { ViewerWindow, loose };
