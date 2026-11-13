const fs = require('fs');
const os = require('os');
const path = require('path');

const { fakeMicrophoneArgs, writeToneWav } = require('../support/fake-microphone');
const { expect, test } = require('../support/launch-app');
const { sheetCase } = require('../support/sheet');

// A fake microphone playing a short tone, then silence. Recognising spoken
// Gurbani (VOICE-02, VOICE-03) needs a real voice and stays with the tester.
const wav = writeToneWav(fs.mkdtempSync(path.join(os.tmpdir(), 'sttm-e2e-mic-')), 4);

test.describe('Voice search', () => {
  test.use({ appLaunch: { args: fakeMicrophoneArgs(wav) } });

  test(
    sheetCase('VOICE-01', 'The waveform appears while the microphone listens'),
    async ({ main }) => {
      // The microphone button shows once the app has checked it is online.
      const mic = main.locator('.input-buttons .icon-button .fa-microphone');
      await expect(mic).toBeVisible({ timeout: 15000 });
      await mic.click();
      await expect(main.locator('.waveform-container')).toBeVisible({ timeout: 10000 });
      expect(path.extname(wav)).toBe('.wav');
    },
  );

  test(
    sheetCase('VOICE-04', 'Listening stops on its own when the speaker goes quiet'),
    async ({ main }) => {
      // Partial: the app stops after silence (1.5 s without sound); the sheet's
      // 15 s figure describes an older build.
      const mic = main.locator('.input-buttons .icon-button .fa-microphone');
      await expect(mic).toBeVisible({ timeout: 15000 });
      await mic.click();
      const waveform = main.locator('.waveform-container');
      await expect(waveform).toBeVisible({ timeout: 10000 });
      await expect(waveform).toBeHidden({ timeout: 20000 });
    },
  );
});
