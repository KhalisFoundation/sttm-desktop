/**
 * @jest-environment jsdom
 */

/**
 * `shouldIgnoreShortcut` decides whether a global keyboard shortcut may fire for
 * a given keydown. Every app shortcut passes through it, including the arrows
 * used for line navigation in Akhand Paatth.
 *
 * Two halves: the first calls the predicate directly, where the policy is
 * cheapest to state exhaustively; the second binds the real hook and dispatches
 * real key events, because a key the predicate correctly withholds is still lost
 * if the browser default was cancelled before the predicate ran. The predicate
 * uses DOM APIs (`closest`, `matches`, `instanceof Element`) but reads no
 * layout, so jsdom is enough.
 */
const React = require('react');
const { createRoot } = require('react-dom/client');
const PropTypes = require('prop-types');
const { shouldIgnoreShortcut, useKeys } = require('../../../www/main/common/hooks/useKeys');
const Switch = require('../../../www/main/common/sttm-ui/switch/Switch').default;

// React 18.3 exposes `act` from `react`; support earlier versions through
// `react-dom/test-utils`.
// eslint-disable-next-line global-require
const act = React.act || require('react-dom/test-utils').act;

const keydown = (target, code) => ({ target, code });

const mount = (html) => {
  document.body.innerHTML = html;
  return (selector) => document.querySelector(selector);
};

describe('shouldIgnoreShortcut', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('allows shortcuts on ordinary elements', () => {
    const $ = mount('<div id="deck"></div>');
    expect(shouldIgnoreShortcut(keydown($('#deck'), 'ArrowDown'))).toBe(false);
    expect(shouldIgnoreShortcut(keydown($('#deck'), 'Space'))).toBe(false);
    expect(shouldIgnoreShortcut(keydown($('#deck'), 'Enter'))).toBe(false);
  });

  it('tolerates a non-Element target (document/window)', () => {
    expect(shouldIgnoreShortcut(keydown(document, 'ArrowDown'))).toBe(false);
    expect(shouldIgnoreShortcut(keydown(null, 'ArrowDown'))).toBe(false);
  });

  describe('controls that own the keyboard while focused', () => {
    it('suppresses every key in a textarea, select and contenteditable', () => {
      const $ = mount(
        '<textarea id="t"></textarea><select id="s"></select><div id="c" contenteditable="true"></div>',
      );
      ['#t', '#s', '#c'].forEach((selector) => {
        expect(shouldIgnoreShortcut(keydown($(selector), 'ArrowDown'))).toBe(true);
      });
    });

    it('honours .disable-kb-shortcuts on an ancestor as well as the target', () => {
      const $ = mount('<div class="disable-kb-shortcuts"><span id="inner"></span></div>');
      expect(shouldIgnoreShortcut(keydown($('#inner'), 'ArrowDown'))).toBe(true);
    });
  });

  describe('the search box', () => {
    /**
     * Ignoring shortcuts whenever an input has focus would block Enter from
     * opening the first result, the arrows from walking results, and Ctrl
     * combinations while the operator is typing.
     */
    const searchBox = () => mount('<input id="q" type="search" class="input-box" />')('#q');

    it('lets the shortcuts through while the operator is typing a query', () => {
      ['Enter', 'NumpadEnter', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].forEach(
        (code) => {
          expect(shouldIgnoreShortcut(keydown(searchBox(), code))).toBe(false);
        },
      );
    });

    it('lets the Ctrl combinations through', () => {
      ['KeyG', 'KeyC', 'Digit1', 'Digit6', 'Slash'].forEach((code) => {
        expect(shouldIgnoreShortcut(keydown(searchBox(), code))).toBe(false);
      });
    });

    /**
     * `useKeys` cancels the browser default for Space, so letting the shortcut
     * layer see it prevents the character from reaching the query. Re-typing
     * Space in `InputBox` covers only two search types.
     */
    it('keeps the space bar, so a query can contain more than one word', () => {
      expect(shouldIgnoreShortcut(keydown(searchBox(), 'Space'))).toBe(true);
    });

    it('applies to every kind of text entry, not just the search box', () => {
      const $ = mount(
        '<input id="plain" /><input id="t" type="text" /><input id="p" type="password" />',
      );
      ['#plain', '#t', '#p'].forEach((selector) => {
        expect(shouldIgnoreShortcut(keydown($(selector), 'Space'))).toBe(true);
        expect(shouldIgnoreShortcut(keydown($(selector), 'ArrowDown'))).toBe(false);
      });
    });
  });

  describe('a slider (range input)', () => {
    /**
     * `useKeys` cancels Space and the vertical arrows for
     * every keydown it does not ignore, so a single unrelated `useKeys('Space')`
     * elsewhere in the document could take the arrows off every slider in the
     * app, including the six in Settings and the Akhand Paatth speed slider.
     */
    const slider = () => mount('<input id="speed" type="range" />')('#speed');

    it('keeps the keys that step it', () => {
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
        'PageUp',
        'PageDown',
      ].forEach((code) => {
        expect(shouldIgnoreShortcut(keydown(slider(), code))).toBe(true);
      });
    });

    /**
     * Space does nothing to a range input, so it stays with the shortcut layer.
     * That is what lets the reading be paused straight after nudging the speed,
     * while the slider still holds focus.
     */
    it('lets Space through so autoplay can be toggled from the slider', () => {
      expect(shouldIgnoreShortcut(keydown(slider(), 'Space'))).toBe(false);
    });
  });

  describe('a focused button', () => {
    /**
     * A button keeps DOM focus after a mouse click. Ignoring all shortcuts while
     * it is focused would block arrow-key line navigation until focus moved.
     * Only the keys the button acts on natively may be suppressed.
     */
    it('still allows arrow-key navigation', () => {
      const $ = mount('<button id="b">go</button>');
      ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].forEach((code) => {
        expect(shouldIgnoreShortcut(keydown($('#b'), code))).toBe(false);
      });
    });

    it('suppresses only the keys the button activates on', () => {
      const $ = mount('<button id="b">go</button>');
      ['Space', 'Enter', 'NumpadEnter'].forEach((code) => {
        expect(shouldIgnoreShortcut(keydown($('#b'), code))).toBe(true);
      });
    });

    it('applies to a target nested inside the button', () => {
      const $ = mount('<button><span id="label">go</span></button>');
      expect(shouldIgnoreShortcut(keydown($('#label'), 'Space'))).toBe(true);
      expect(shouldIgnoreShortcut(keydown($('#label'), 'ArrowDown'))).toBe(false);
    });
  });

  describe('a checkbox or radio', () => {
    /**
     * Space operates these controls from the keyboard, and `useKeys` cancels the
     * browser default for Space on each keydown it does not withhold. Without
     * this rule, the navigator's Space binding advances the slide instead of
     * toggling a focused Settings switch, including the Akhand Paatth toggle.
     */
    const controls = () =>
      mount('<input id="c" type="checkbox" /><input id="r" type="radio" name="g" />');

    it('keeps Space for checkboxes and radios', () => {
      const $ = controls();
      expect(shouldIgnoreShortcut(keydown($('#c'), 'Space'))).toBe(true);
      expect(shouldIgnoreShortcut(keydown($('#r'), 'Space'))).toBe(true);
    });

    /**
     * The counterpart to the button rule: these keep DOM focus after a mouse
     * click, so claiming the arrows would kill arrow-key line navigation for as
     * long as the operator happened to leave a switch focused.
     */
    it('still allows arrow-key navigation', () => {
      const $ = controls();
      ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].forEach((code) => {
        expect(shouldIgnoreShortcut(keydown($('#c'), code))).toBe(false);
        expect(shouldIgnoreShortcut(keydown($('#r'), code))).toBe(false);
      });
    });

    it('does not withhold Space from other input types', () => {
      const $ = mount('<input id="n" type="number" /><input id="d" type="date" />');
      expect(shouldIgnoreShortcut(keydown($('#n'), 'Space'))).toBe(false);
      expect(shouldIgnoreShortcut(keydown($('#d'), 'Space'))).toBe(false);
    });
  });
});

describe('useKeys', () => {
  /**
   * Binding the real hook and pressing a real key, rather than asking the
   * predicate what it thinks.
   *
   * The two are not the same contract. `useKeys` cancels the browser default
   * for Space and the vertical arrows so that a shortcut bound to them is not
   * fighting the page scroll. Whether a character survives therefore depends on
   * statement order inside the hook: the withholding check must come first.
   * Predicate-only assertions cannot cover that ordering.
   */
  const Probe = ({ code }) => {
    useKeys(code, 'single', () => {});
    return null;
  };

  Probe.propTypes = { code: PropTypes.string.isRequired };

  let container;
  let root;

  const bind = (code) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(React.createElement(Probe, { code })));
  };

  /** @returns {boolean} whether the character still reaches the control. */
  const press = (target, code) => {
    const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
    act(() => {
      target.dispatchEvent(event);
    });
    return !event.defaultPrevented;
  };

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
  });

  it('leaves the space bar alone inside the search box', () => {
    bind('Space');
    document.body.insertAdjacentHTML('afterbegin', '<input id="q" type="search" />');
    expect(press(document.querySelector('#q'), 'Space')).toBe(true);
  });

  it('leaves the arrow keys alone on a slider', () => {
    bind('ArrowDown');
    document.body.insertAdjacentHTML('afterbegin', '<input id="speed" type="range" />');
    expect(press(document.querySelector('#speed'), 'ArrowDown')).toBe(true);
  });

  /**
   * Mounting the real `Switch`, not hand-written markup, because the defect this
   * guards was invisible to markup written by the test: it depended on what the
   * component actually renders. `Switch` puts a checkbox behind a styled label
   * and moves it off-screen, which leaves it focusable. The operator can tab to
   * it, so Space has to reach it.
   */
  it('leaves the space bar alone on a settings switch', () => {
    bind('Space');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const switchRoot = createRoot(host);
    act(() =>
      switchRoot.render(
        React.createElement(Switch, { controlId: 'akhandpatt', onToggle: () => {} }),
      ),
    );

    const input = host.querySelector('input[type="checkbox"]');
    expect(input).not.toBeNull();
    expect(press(input, 'Space')).toBe(true);

    act(() => switchRoot.unmount());
    host.remove();
  });

  /**
   * The other half of the same contract: where no control owns the key, the
   * default is cancelled. Without this, the guard could be widened to
   * everything and the two tests above would still pass while every shortcut in
   * the app fought the page scroll.
   */
  it('cancels the page scroll where no control owns the key', () => {
    bind('Space');
    document.body.insertAdjacentHTML('afterbegin', '<div id="deck"></div>');
    expect(press(document.querySelector('#deck'), 'Space')).toBe(false);
  });

  it('only cancels the keys that scroll the page', () => {
    bind('Enter');
    document.body.insertAdjacentHTML('afterbegin', '<div id="deck"></div>');
    expect(press(document.querySelector('#deck'), 'Enter')).toBe(true);
  });
});
