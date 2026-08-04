/**
 * Covers the correction pace between windows and the sub-pixel split used to
 * paint smooth movement.
 */
const fs = require('fs');
const path = require('path');
const { parseSync, traverse } = require('@babel/core');
const {
  currentScrollTop,
  remoteCorrection,
  wholePixels,
  subPixelTransform,
} = require('../../../www/main/viewer/akhandpatt/scroll-motion');
const {
  SUB_PIXEL_EPSILON_PX,
  SYNC_CORRECTION_GAIN,
} = require('../../../www/main/viewer/akhandpatt/scroll-config');

describe('closing on the window being mirrored', () => {
  it('moves towards the target, never past it', () => {
    const correction = remoteCorrection(100, 140);
    expect(correction).toBeGreaterThan(0);
    expect(correction).toBeLessThan(40);
  });

  it('corrects backwards when the follower has run ahead', () => {
    expect(remoteCorrection(140, 100)).toBeLessThan(0);
  });

  it('ignores sub-pixel sync errors', () => {
    expect(remoteCorrection(100, 100 + SUB_PIXEL_EPSILON_PX / 2)).toBe(0);
    expect(remoteCorrection(100, 100 - SUB_PIXEL_EPSILON_PX / 2)).toBe(0);
  });

  it('converges rather than oscillating', () => {
    const target = 500;
    let position = 0;
    let previousError = Math.abs(target - position);
    for (let frame = 0; frame < 200; frame += 1) {
      position += remoteCorrection(position, target);
      const error = Math.abs(target - position);
      expect(error).toBeLessThanOrEqual(previousError);
      previousError = error;
    }
    expect(previousError).toBeLessThan(SUB_PIXEL_EPSILON_PX);
  });

  it('never reverses the reading while it is scrolling', () => {
    // A reader watching the Gurbani move backwards has seen a bug whatever the
    // pace was, so this stays separate from the pace test above: if both go red
    // the correction is swamping the motion, and if only the pace test does,
    // the motion still leads and only its evenness has regressed.
    const stepPerFrame = 3.33;
    let position = 0;
    let leader = 0;
    for (let frame = 0; frame < 600; frame += 1) {
      leader += stepPerFrame;
      const target = leader + (frame % 2 ? 1 : -1);
      const advanced = position + stepPerFrame;
      const next = advanced + remoteCorrection(advanced, target);
      expect(next).toBeGreaterThan(position);
      position = next;
    }
  });

  it('holds a steady pace despite the two windows disagreeing', () => {
    // Taking the whole error each frame is equivalent to assigning the remote
    // position directly. The pixel of layout rounding that two differently
    // typeset windows can
    // always disagree by was applied in full, and a steady 3.3px/frame was
    // rendered as 2, 5, 2, 5: the lurch an operator sees as judder. Taking a
    // fraction of the error instead leaves the pace within a few percent of the
    // reading speed that was actually asked for.
    const stepPerFrame = 3.33;
    const tolerance = 0.25;
    let position = 0;
    let leader = 0;
    for (let frame = 0; frame < 600; frame += 1) {
      leader += stepPerFrame;
      // Model a whole pixel of layout rounding, alternating in sign each frame.
      const target = leader + (frame % 2 ? 1 : -1);
      const advanced = position + stepPerFrame;
      const next = advanced + remoteCorrection(advanced, target);
      const painted = next - position;

      expect(painted).toBeGreaterThan(0);
      expect(painted).toBeGreaterThan(stepPerFrame * (1 - tolerance));
      expect(painted).toBeLessThan(stepPerFrame * (1 + tolerance));
      position = next;
    }
  });

  it('keeps up with the window it mirrors', () => {
    const stepPerFrame = 3.33;
    let position = 0;
    let leader = 200; // Start a viewport behind and catch up.
    for (let frame = 0; frame < 600; frame += 1) {
      leader += stepPerFrame;
      const advanced = position + stepPerFrame;
      position = advanced + remoteCorrection(advanced, leader);
    }
    expect(Math.abs(leader - position)).toBeLessThan(1);
  });
});

describe('positions that are not a whole number of pixels', () => {
  it('scrolls to the whole pixels a container will accept', () => {
    expect(wholePixels(120.7)).toBe(120);
    expect(wholePixels(120)).toBe(120);
  });

  it('paints the remainder the scroll position could not express', () => {
    expect(subPixelTransform(120.25)).toBe('translateY(-0.25px)');
  });

  it('asks for no transform when the position is already whole', () => {
    expect(subPixelTransform(120)).toBe('');
  });

  it('adds up to the position asked for', () => {
    for (let step = 0; step < 40; step += 1) {
      const position = 100 + step * 3.33;
      const painted = subPixelTransform(position);
      const fraction = painted ? -parseFloat(painted.slice('translateY('.length)) : 0;
      expect(wholePixels(position) + fraction).toBeCloseTo(position, 6);
    }
  });

  it('moves by an equal amount every frame at a constant velocity', () => {
    // What `scrollTop` alone cannot do on a 1x display, and the whole reason
    // this split exists: at 3.33px/frame it can only render 3, 4, 3, 3, 4.
    const velocity = 3.33;
    const steps = [];
    for (let frame = 1; frame <= 60; frame += 1) {
      const previous = 100 + (frame - 1) * velocity;
      const current = 100 + frame * velocity;
      const paint = (position) => {
        const transform = subPixelTransform(position);
        const fraction = transform ? -parseFloat(transform.slice('translateY('.length)) : 0;
        return wholePixels(position) + fraction;
      };
      steps.push(paint(current) - paint(previous));
    }
    steps.forEach((step) => expect(step).toBeCloseTo(velocity, 6));
  });
});

describe('the correction gain', () => {
  it('is a fraction, so a correction can neither overshoot nor be ignored', () => {
    expect(SYNC_CORRECTION_GAIN).toBeGreaterThan(0);
    expect(SYNC_CORRECTION_GAIN).toBeLessThan(1);
  });
});

describe('moving the deck relative to where it already is', () => {
  // A container reports its position back a fraction short of what was asked
  // for, because `wholePixels` truncates on the way in. `currentScrollTop`
  // decides which of the two descriptions to move relative to.
  const paintedBy = (container) => container.requested;

  // A container that only accepts whole pixels, as Chromium's does at 1x.
  const makeContainer = () => ({
    requested: 0,
    reported: 0,
    scrollTo(position) {
      this.requested = position;
      this.reported = wholePixels(position);
    },
  });

  it('uses the requested position when the container truncated it', () => {
    expect(currentScrollTop(120.75, 120)).toBe(120.75);
  });

  it('defers to the container once something else has moved it', () => {
    // A whole pixel of disagreement cannot have come from truncation, so it did
    // not come from us: a native scrollbar drag, or a clamp when content shrank.
    expect(currentScrollTop(4000, 1200)).toBe(1200);
    expect(currentScrollTop(0, 900)).toBe(900);
  });

  it('holds the reading still while a Shabad inflates above it', () => {
    // An anchor settle compensates a prepended Shabad growing above the reader
    // by pushing the deck down by the same amount, frame by frame, until the
    // reflow stops. It measures that
    // growth from content offsets, which say nothing about the scroll position,
    // so nothing re-measures the position itself. A fraction dropped on one
    // frame is dropped again on each later frame.
    const container = makeContainer();
    container.scrollTo(1000);
    const startedAt = paintedBy(container);
    const growthPerFrame = 7.3;
    let compensated = 0;

    for (let frame = 0; frame < 120; frame += 1) {
      container.scrollTo(
        currentScrollTop(container.requested, container.reported) + growthPerFrame,
      );
      compensated += growthPerFrame;
    }

    expect(paintedBy(container) - startedAt).toBeCloseTo(compensated, 6);
  });

  it('would let the reading slide away if it took the truncated position', () => {
    // Comparison run: move relative to the container's reported position.
    const container = makeContainer();
    container.scrollTo(1000);
    const startedAt = paintedBy(container);
    const growthPerFrame = 7.3;

    for (let frame = 0; frame < 120; frame += 1) {
      container.scrollTo(container.reported + growthPerFrame);
    }

    expect(paintedBy(container) - startedAt).toBeLessThan(120 * growthPerFrame - 30);
  });
});

describe('two loops moving the deck in the same frame', () => {
  // Several `requestAnimationFrame` loops run at once, and the browser promises
  // nothing about which of them runs first within a frame. The order is not even
  // stable across a session: pausing and playing re-registers the scroll step,
  // which puts it behind loops that were behind it before.
  //
  // Two of those loops can write the deck in the same frame. The scroll step
  // recomputes an absolute position from its own accumulator; the anchor settle
  // moves the deck relative to wherever it already is. Whether the reading lands
  // in the same place either way is checked in both orders below.
  const FRAMES = 60;
  const VELOCITY_PER_FRAME = 3.3;
  const GROWTH_PER_FRAME = 7.3;

  const advanceOverBothLoops = (settleBase, order) => {
    let requested = 1000;
    let reported = wholePixels(requested);
    const startedAt = requested;
    const write = (position) => {
      requested = position;
      reported = wholePixels(position);
    };
    const step = () => write(requested + VELOCITY_PER_FRAME);
    const settle = () => write(settleBase(requested, reported) + GROWTH_PER_FRAME);

    for (let frame = 0; frame < FRAMES; frame += 1) {
      if (order === 'settle first') {
        settle();
        step();
      } else {
        step();
        settle();
      }
    }
    return requested - startedAt;
  };

  const asked = FRAMES * (VELOCITY_PER_FRAME + GROWTH_PER_FRAME);

  it('lands in the same place whichever of them runs first', () => {
    expect(advanceOverBothLoops(currentScrollTop, 'settle first')).toBeCloseTo(asked, 6);
    expect(advanceOverBothLoops(currentScrollTop, 'step first')).toBeCloseTo(asked, 6);
  });

  it('lost ground in both orders when the settle re-truncated its base', () => {
    // Taking the container's truncated position gives up about 35px of the 636px
    // asked for over these 60 frames, and running the two loops the other way
    // round moved that by a third of a pixel. The order was never what was wrong.
    const truncated = (requested, reported) => reported;
    const settleFirst = advanceOverBothLoops(truncated, 'settle first');
    const stepFirst = advanceOverBothLoops(truncated, 'step first');

    expect(asked - settleFirst).toBeGreaterThan(30);
    expect(asked - stepFirst).toBeGreaterThan(30);
    expect(Math.abs(settleFirst - stepFirst)).toBeLessThan(1);
  });
});

describe('who owns the sub-pixel offset', () => {
  const hookPath = path.join(
    __dirname,
    '../../../www/main/viewer/akhandpatt/useAkhandpattScroll.js',
  );
  const ast = parseSync(fs.readFileSync(hookPath, 'utf8'), {
    filename: hookPath,
    cwd: path.join(__dirname, '../../..'),
    ast: true,
    code: false,
  });

  const isMember = (node, object, property) =>
    node &&
    node.type === 'MemberExpression' &&
    node.property.name === property &&
    node.object.type === 'MemberExpression' &&
    node.object.property.name === object;

  it('is written and cleared in one place each', () => {
    // A second writer would compete with the scroll for the same transform, and
    // whichever wrote last would decide where the deck appeared to be.
    const writes = [];
    traverse(ast, {
      AssignmentExpression: ({ node }) => {
        if (isMember(node.left, 'style', 'transform')) {
          writes.push(node.left.loc.start.line);
        }
      },
    });
    expect(writes).toHaveLength(2);
  });

  it('is never re-truncated by a caller working out its own base', () => {
    // The tests above show what taking the container's `scrollTop` as the base
    // for a relative move costs; this is what stops one being written. Every
    // `setScrollTop` caller passes a position worked out from scratch, and the
    // two that only know how far to move go through `moveScrollTopBy`, which
    // picks the base once. A caller reaching for `scrollTop` here is reaching
    // for the truncated one.
    const relative = [];
    traverse(ast, {
      CallExpression: (callPath) => {
        const { callee } = callPath.node;
        if (callee.type !== 'Identifier' || callee.name !== 'setScrollTop') {
          return;
        }
        callPath.traverse({
          BinaryExpression: ({ node }) => {
            const relativeToScrollTop = (side) =>
              side.type === 'MemberExpression' && side.property.name === 'scrollTop';
            if (
              ['+', '-'].includes(node.operator) &&
              (relativeToScrollTop(node.left) || relativeToScrollTop(node.right))
            ) {
              relative.push(node.loc.start.line);
            }
          },
        });
      },
    });
    expect(relative).toEqual([]);
  });

  it('is cleared for the whole life of the view, not just while it scrolls', () => {
    // The scroll loop returns early when paused and registers no cleanup. Hanging
    // the clear off it would leave an offset and its stacking context on the
    // ordinary slide view after a wheel nudge on a paused deck.
    const deps = [];
    traverse(ast, {
      CallExpression: ({ node }) => {
        const { callee, arguments: args } = node;
        if (callee.type !== 'Identifier' || callee.name !== 'useEffect') {
          return;
        }
        const [effect, dependencies] = args;
        const clearsOffset =
          effect &&
          effect.type === 'ArrowFunctionExpression' &&
          effect.body.type === 'Identifier' &&
          effect.body.name === 'clearSubPixelOffset';
        if (clearsOffset && dependencies && dependencies.type === 'ArrayExpression') {
          deps.push(dependencies.elements.map((element) => element.name));
        }
      },
    });
    expect(deps).toEqual([['akhandpatt']]);
  });
});
