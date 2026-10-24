// errors.log never carries a computer's account name. Run with: node --test www/main/addons/voice-follow/shadow/scrub.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const { scrub } = require('./diag');

describe('diag scrub', () => {
  it('replaces home folders on macOS, Windows and Linux', () => {
    assert.equal(
      scrub("File at path '/Users/someone/Library/x.realm'"),
      "File at path '~/Library/x.realm'",
    );
    assert.equal(scrub('C:\\Users\\Some One\\AppData\\x'), '~\\AppData\\x');
    assert.equal(scrub('/home/pi/.config/x'), '~/.config/x');
    assert.ok(!scrub(`${os.homedir()}/a`).includes(os.homedir()));
  });
  it('leaves other text alone', () => {
    assert.equal(scrub('db: ready (225230848 bytes)'), 'db: ready (225230848 bytes)');
  });
});
