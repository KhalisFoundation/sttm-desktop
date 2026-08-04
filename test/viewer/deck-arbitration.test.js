/**
 * Two windows render the continuous deck: the operator's in-app preview and the
 * external display. Both run the same scroll code and both emit, so the main
 * process decides which one leads because it knows whether an external display
 * exists.
 *
 * It makes that decision twice, once for the scroll position and once for the
 * overlay line, and the two have to agree. They did not: the scroll treated the
 * preview as the source and the overlay treated the external display as the
 * source. A display that appeared mid-reading starts empty and emits nothing,
 * stopping the overlay feed while it follows the preview's scroll. The OBS text
 * files, socket overlay, and Zoom feed then keep the last line sent.
 *
 * `app.js` is the Electron main entry point and cannot be imported here, so the
 * two handlers are compared as written.
 */
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');

/** The body of `ipcMain.on('<channel>', ...)`, up to its closing `});`. */
const handlerBody = (channel) => {
  const start = APP.indexOf(`ipcMain.on('${channel}'`);
  if (start === -1) {
    throw new Error(`no handler for ${channel}`);
  }
  const end = APP.indexOf('\n});', start);
  return APP.slice(start, end);
};

describe('which deck leads', () => {
  const overlay = handlerBody('akhandpatt-overlay-line');
  const scroll = handlerBody('akhandpatt-scroll-sync');

  // The control: both bodies must actually have been found and be distinct,
  // or the comparisons below would be comparing a string with itself.
  it('finds both handlers', () => {
    expect(overlay.length).toBeGreaterThan(40);
    expect(scroll.length).toBeGreaterThan(40);
    expect(overlay).not.toBe(scroll);
  });

  /**
   * Both identify the external display the same way, and both use it to decide
   * that a message came from the mirror rather than from the operator.
   */
  it('identifies the external display the same way in both', () => {
    expect(overlay).toContain('event.sender === viewerWindow.webContents');
    expect(scroll).toContain('event.sender === viewerWindow.webContents');
  });

  it('never lets the external display drive the overlay', () => {
    // Dropped: an emission from the external display.
    expect(overlay).toMatch(
      /if \(viewerWindow && event\.sender === viewerWindow\.webContents\) \{\s*return;/,
    );
    // Delivered: everything else, including when no external display exists.
    expect(overlay).toContain('broadcastOverlayLine(arg)');
  });

  it('never relays the external display\u2019s scroll position back to itself', () => {
    expect(scroll).toMatch(
      /if \(!viewerWindow \|\| event\.sender === viewerWindow\.webContents\) \{\s*return;/,
    );
    expect(scroll).toContain('viewerWindow.webContents.send');
  });
});
