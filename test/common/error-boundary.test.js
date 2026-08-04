/**
 * @jest-environment jsdom
 */

/** Covers retries, the retry cap, budget reset, fallbacks, and error logging. */
const React = require('react');
const { createRoot } = require('react-dom/client');
const fs = require('fs');

// `act` moved from `react-dom/test-utils` to `react` in 18.3. Support both.
// eslint-disable-next-line global-require
const act = React.act || require('react-dom/test-utils').act;

jest.mock('@electron/remote', () => ({
  app: { getPath: () => '/tmp/sttm-test' },
}));

const ErrorBoundary = require('../../www/main/common/sttm-ui/error-boundary/ErrorBoundary').default;

const RETRY_DELAY_MS = 250;
const MAX_AUTO_RETRIES = 3;
const HEALTHY_MS = 1000;

// Flipped from outside the render rather than decremented inside it, so a
// double render in development mode cannot consume a fault the test did not
// intend to spend.
let shouldThrow = false;
// Thrown from an effect rather than from the render body. React runs effects
// after the commit, so this is the class of fault that reaches the boundary
// only once the subtree has already rendered successfully.
let shouldThrowInEffect = false;

const Child = () => {
  React.useEffect(() => {
    if (shouldThrowInEffect) {
      throw new Error('effect fault');
    }
  });
  if (shouldThrow) {
    throw new Error('render fault');
  }
  return React.createElement('span', { className: 'child' }, 'Gurbani');
};

/**
 * Mounts a boundary and returns handles for driving it. `rerender` bumps a prop
 * so the child renders again and picks up the current `shouldThrow`.
 */
const mount = (props = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let tick = 0;

  const paint = () => {
    act(() => {
      root.render(
        React.createElement(
          ErrorBoundary,
          { label: 'test', ...props },
          React.createElement(Child, { key: 'child', tick }),
        ),
      );
    });
  };

  paint();

  return {
    host,
    text: () => host.textContent,
    rerender: () => {
      tick += 1;
      paint();
    },
    settle: () => {
      act(() => {
        jest.advanceTimersByTime(RETRY_DELAY_MS);
      });
    },
    // Lets the remounted subtree prove it has stayed up, which is what refills
    // the retry budget.
    recover: () => {
      act(() => {
        jest.advanceTimersByTime(HEALTHY_MS);
      });
    },
    unmount: () => act(() => root.unmount()),
  };
};

describe('ErrorBoundary', () => {
  let consoleError;

  beforeEach(() => {
    jest.useFakeTimers();
    shouldThrow = false;
    shouldThrowInEffect = false;
    // React prints every caught error itself; the boundary adds its own labelled
    // line. Both are noise here, but the labelled one is asserted below.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    jest.useRealTimers();
  });

  test('renders its children when nothing goes wrong', () => {
    const view = mount();
    expect(view.text()).toBe('Gurbani');
    view.unmount();
  });

  test('recovers on its own from a fault that has cleared', () => {
    const view = mount();

    shouldThrow = true;
    view.rerender();
    expect(view.text()).toBe('');

    shouldThrow = false;
    view.settle();

    expect(view.text()).toBe('Gurbani');
    view.unmount();
  });

  test('settles on a fallback once a fault will not clear', () => {
    const view = mount();

    shouldThrow = true;
    view.rerender();
    for (let i = 0; i < MAX_AUTO_RETRIES; i += 1) {
      view.settle();
    }

    expect(view.text()).toContain('Something went wrong');
    expect(view.text()).toContain('render fault');

    // Bounded: no further timer is pending, so it cannot retry indefinitely.
    expect(jest.getTimerCount()).toBe(0);
    view.unmount();
  });

  test('shows the callers fallback in place of the default one', () => {
    const view = mount({ fallback: React.createElement('p', null, 'Reading paused') });

    shouldThrow = true;
    view.rerender();
    for (let i = 0; i < MAX_AUTO_RETRIES; i += 1) {
      view.settle();
    }

    expect(view.text()).toBe('Reading paused');
    view.unmount();
  });

  /** A successful remount resets the retry budget for a later error. */
  test('keeps recovering from faults that arrive far apart', () => {
    const view = mount();

    for (let fault = 0; fault < MAX_AUTO_RETRIES + 1; fault += 1) {
      shouldThrow = true;
      view.rerender();
      shouldThrow = false;
      view.settle();
      expect(view.text()).toBe('Gurbani');
      // The budget is refilled by staying up, not by the retry committing, so
      // the subtree has to be left alone for a while between faults.
      view.recover();
    }

    view.unmount();
  });

  test('settles on a fallback once an effect fault will not clear', () => {
    const view = mount();

    shouldThrowInEffect = true;
    view.rerender();
    // Well past the cap. An effect throws after its commit, so a boundary that
    // treated that commit as a recovery would refill the budget every time and
    // remount forever instead of ever reaching the fallback.
    for (let i = 0; i < MAX_AUTO_RETRIES * 4; i += 1) {
      view.settle();
    }

    expect(view.text()).toContain('Something went wrong');
    expect(jest.getTimerCount()).toBe(0);

    shouldThrowInEffect = false;
    view.unmount();
  });

  test('recovers from an effect fault that has cleared', () => {
    const view = mount();

    shouldThrowInEffect = true;
    view.rerender();
    shouldThrowInEffect = false;
    view.settle();

    expect(view.text()).toBe('Gurbani');
    view.recover();
    expect(jest.getTimerCount()).toBe(0);
    view.unmount();
  });

  test('records the failing subtree by label', () => {
    const view = mount({ label: 'viewer-deck' });

    shouldThrow = true;
    view.rerender();

    const labelled = consoleError.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[ErrorBoundary:viewer-deck]'),
    );
    expect(labelled.length).toBeGreaterThan(0);

    shouldThrow = false;
    view.settle();
    view.unmount();
  });

  test('leaves no retry pending after it is unmounted', () => {
    const view = mount();

    shouldThrow = true;
    view.rerender();
    // The fault scheduled a retry; unmounting must take it back out again,
    // otherwise the timer keeps the torn-down subtree alive until it fires.
    expect(jest.getTimerCount()).toBe(1);

    view.unmount();

    expect(jest.getTimerCount()).toBe(0);
    shouldThrow = false;
  });
});

describe('ErrorBoundary crash log', () => {
  const MAX_CRASH_LOG_BYTES = 512 * 1024;
  let spies;
  let consoleError;

  beforeEach(() => {
    spies = {
      existsSync: jest.spyOn(fs, 'existsSync').mockReturnValue(true),
      statSync: jest.spyOn(fs, 'statSync').mockReturnValue({ size: 0 }),
      renameSync: jest.spyOn(fs, 'renameSync').mockImplementation(() => {}),
      appendFile: jest.spyOn(fs, 'appendFile').mockImplementation(() => {}),
    };
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.values(spies).forEach((spy) => spy.mockRestore());
    consoleError.mockRestore();
  });

  test('appends the error and the component stack', () => {
    ErrorBoundary.persist('viewer', new Error('boom'), '\n    in Slide');

    expect(spies.appendFile).toHaveBeenCalledTimes(1);
    const [target, entry] = spies.appendFile.mock.calls[0];
    expect(target).toContain('sttm-crash.log');
    expect(entry).toContain('[viewer]');
    expect(entry).toContain('boom');
    expect(entry).toContain('in Slide');
  });

  test('rolls the log over once it reaches its size cap', () => {
    spies.statSync.mockReturnValue({ size: MAX_CRASH_LOG_BYTES });

    ErrorBoundary.persist('viewer', new Error('boom'), '');

    expect(spies.renameSync).toHaveBeenCalledTimes(1);
    const [, rotated] = spies.renameSync.mock.calls[0];
    expect(rotated).toMatch(/sttm-crash\.log\.1$/);
    // Still logs the fault that triggered the rollover.
    expect(spies.appendFile).toHaveBeenCalledTimes(1);
  });

  test('leaves a log below the cap in place', () => {
    spies.statSync.mockReturnValue({ size: MAX_CRASH_LOG_BYTES - 1 });

    ErrorBoundary.persist('viewer', new Error('boom'), '');

    expect(spies.renameSync).not.toHaveBeenCalled();
  });

  /** A logging error does not escape the boundary. */
  test('swallows a failure to write the log', () => {
    spies.existsSync.mockImplementation(() => {
      throw new Error('disk full');
    });

    expect(() => ErrorBoundary.persist('viewer', new Error('boom'), '')).not.toThrow();
  });
});
