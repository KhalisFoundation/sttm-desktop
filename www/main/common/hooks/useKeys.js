import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

const TEXT_ENTRY = [
  'input:not([type])',
  'input[type="text"]',
  'input[type="search"]',
  'input[type="password"]',
  'input[type="email"]',
  'input[type="url"]',
  'input[type="tel"]',
].join(', ');

/**
 * Keys that a focused control already acts on itself, paired with the control.
 * A shortcut must stay out of their way, or the press is handled twice; and
 * because `useKeys` cancels the browser default for Space and the vertical
 * arrows, it could take the key away from the control altogether.
 *
 * Each entry lists only the keys that control owns. Ignoring every shortcut
 * whenever a control has focus would remove most of the app's keyboard.
 */
const NATIVE_KEY_OWNERS = [
  {
    // A button is pressed by Space and Enter. Not the arrows: a button keeps DOM
    // focus after a mouse click, so claiming them here would disable arrow-key
    // line navigation until focus happened to move elsewhere.
    selector: 'button',
    keys: ['Space', 'Enter', 'NumpadEnter'],
  },
  {
    // A slider steps on the arrows and jumps on Home/End/PageUp/PageDown. Space
    // does nothing to it, so Space remains a shortcut. This lets the reading be
    // paused while the speed slider still holds focus.
    selector: 'input[type="range"]',
    keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'],
  },
  {
    // In text entry the space bar is a character, not a shortcut. Enter and the
    // arrows remain app shortcuts: the search box relies on Enter opening the
    // first result and on the arrows walking the result list.
    selector: TEXT_ENTRY,
    keys: ['Space'],
  },
  {
    // A checkbox or radio is toggled by Space, which is the only way to operate
    // one from the keyboard. Every switch in Settings is one of these, including
    // the Akhand Paatth toggle itself.
    //
    // Not the arrows. They do move between the radios of a group natively, but
    // these controls keep DOM focus after a mouse click just as a button does,
    // so claiming the arrows would disable arrow-key line navigation until focus
    // happened to move on. Each radio in this app is `display: none` behind a
    // styled label and cannot be focused directly. Revisit if a radio group is
    // ever exposed directly.
    selector: 'input[type="checkbox"], input[type="radio"]',
    keys: ['Space'],
  },
];

export const shouldIgnoreShortcut = (event) => {
  const { target } = event;
  if (!(target instanceof Element)) {
    return false;
  }

  // Controls that own the whole keyboard while focused, plus the opt-out marker
  // the Announcement editor already carried.
  if (target.closest('.disable-kb-shortcuts, [contenteditable="true"], textarea, select')) {
    return true;
  }

  return NATIVE_KEY_OWNERS.some(
    ({ selector, keys }) => keys.includes(event.code) && target.closest(selector) !== null,
  );
};

/**
 * Bind an app-wide keyboard shortcut for as long as the component is mounted.
 *
 * Shortcuts here are global: they fire wherever focus happens to be. The only
 * presses withheld are the ones a focused control owns, listed in
 * `NATIVE_KEY_OWNERS` above. Enter and the arrows remain app shortcuts in text
 * entry because the search box needs them. A handler bound to those keys must
 * decide whether it should act while the operator is typing, as the Launchpad's
 * verse-stepping handlers do by checking what has focus.
 *
 * @param {string} key A `KeyboardEvent.code`, e.g. 'Space', 'ArrowDown', 'Digit1'
 * @param {'single'|'combination'} shortcutType Whether Ctrl/Cmd must also be held
 * @param {(event: KeyboardEvent) => void} cb Runs on keydown, re-read every render
 */
export const useKeys = (key, shortcutType, cb) => {
  const callbackRef = useRef(cb);

  useEffect(() => {
    callbackRef.current = cb;
  });

  useEffect(() => {
    const handle = (event) => {
      if (shouldIgnoreShortcut(event)) {
        return;
      }

      // Space and the vertical arrows scroll the page, which would fight any
      // shortcut bound to them. Cancelling here is safe only because the
      // owners above have already been let through: this line is what would
      // otherwise take the arrows off a slider and the space bar off a query.
      const defaultException = ['Space', 'ArrowUp', 'ArrowDown'];
      if (defaultException.includes(event.code)) {
        event.preventDefault();
      }

      if (shortcutType === 'single') {
        if (event.code === key) {
          callbackRef.current(event);
        }
      }
      if (shortcutType === 'combination') {
        if (event.code === key && (event.ctrlKey || event.metaKey)) {
          callbackRef.current(event);
        }
      }
    };

    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [key, shortcutType]);
};

useKeys.propTypes = {
  key: PropTypes.string,
  cb: PropTypes.function,
};
