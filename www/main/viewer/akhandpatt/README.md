# Akhand Paatth infinite scroll

Continuous "teleprompter" scrolling for Akhand Paatth view: the Gurbani flows
smoothly past a centre line and runs on into the next Shabad indefinitely,
instead of the reader clicking from slide to slide.

Reached from two places only. `ShabadDeck` imports `useAkhandpattScroll`, which
it drives when the `akhandpatt` user setting is on, and `layout-revision`, which
it computes on every render. `AutoPlayIcon` imports `scroll-config`, so its
slider and the scroll loop cannot disagree about the speed bounds.
`module-boundary.test.js` holds the boundary to exactly those three imports and
fails on a fourth.

This folder is logic only. The controls the operator sees are components in
`viewer/Slide/`: `AutoPlayIcon` (play/pause, speed) and `SpacingTools`. The
layout lives in `src/scss/viewer/verse-slide/_verse-slide.scss` (the verse
boxes and both spacing axes) and `src/scss/viewer/shabad-deck/_shabad-deck.scss`
(the scrolling container and the loading state).

## Vocabulary

| Term          | Meaning                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Akhand Paatth | An unbroken cover-to-cover reading of the SGGS, taking around 48 hours in relay. The reason this feature exists.                                                               |
| Shabad        | One composition, and the unit the database indexes and this feature loads and drops. Lengths vary enormously, from two verses to several hundred.                              |
| Verse         | One line of a Shabad, and the unit everything here measures. A `verseId` names it and `data-verseid` tags its element.                                                        |
| SGGS          | Sri Guru Granth Sahib. Its Shabads run `1..5540`, skipping 1640 and 4196. A reading stops at 5540 rather than running on into Dasam Bani.                                      |
| Bani          | A named, finite selection: Japji Sahib, Rehras Sahib, a ceremony. Also loaded into the deck, but it _ends_: there is no "next", so infinite scrolling is off for these.        |
| Larivaar      | Gurmukhi written without spaces between words, as in the original manuscripts. A display option, and one that changes verse heights, hence its place in `layout-revision.js`.  |

## Modules

| File                     | Responsibility                                                                                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAkhandpattScroll.js` | Owns the scroll loop, mouse wheel handling, seeking to a line, just-in-time loading and pruning, and cross-window sync. The helpers below pull the arithmetic out so this file is mostly behaviour.                                                             |
| `shabad-window.js`       | Pure model of the loaded window of Shabads (append / prepend / drop), with no DOM or React. Unit-tested.                                                                                                                                                        |
| `shabad-feed.js`         | The only place that reads Shabads from the database. Turns Realm rows into plain objects, keeps a reading inside the source it began in, and steps over unused ids so that a gap is not mistaken for the end. See "Reading past a wide gap".   |
| `scroll-config.js`       | Every tunable constant, each with the reasoning (and usually the measurement) behind its value, plus the speed model. Read this before changing a number.                                                                                                       |
| `scroll-anchor.js`       | Converts a scroll position to a _content_ anchor (`{ verseId, fraction }`) and back, so the preview and the projection can agree on a line despite laying it out at very different sizes.                                                                       |
| `scroll-motion.js`       | The arithmetic of moving smoothly: how hard to correct towards the window being mirrored, and how to express a position that is not a whole number of pixels. Both were bugs you could only see on a projector, and both come down to functions the tests can pin. |
| `verse-elements.js`      | The only place that knows a verse is found in the DOM by `data-verseid`. `Slide.jsx` stamps the attribute; everything that measures verses reads it through here.                                                                                               |
| `layout-revision.js`     | Names the settings that change a verse's height, and builds the token that tells the deck a reflow happened so it can put the reader's line back.                                                                                                               |
| `reading-position.js`    | Remembers where the reader had got to, outside React, so a render fault that unmounts the deck resumes the reading instead of restarting it.                                                                                                                    |
| `scroll-debug.js`        | Opt-in trace buffer for diagnosing scroll problems. Inert unless switched on.                                                                                                                                                                                   |

## Why a content anchor

The operator's preview pane and the sangat's projection show the same Gurbani at
very different sizes, so a pixel offset means nothing between them. The preview
broadcasts _which verse is on its centre line and how far through it_, and the
projection resolves that against its own layout. See `scroll-anchor.js`.

The related styling rule, that everything contributing to a verse's height must
be viewport-relative so the preview stays a true scaled replica, lives in
`www/src/scss/viewer/verse-slide/_verse-slide.scss`.

## The three settle loops

Layout does not finish when React commits. Fonts arrive late, a resize animates
over many frames, and a newly mounted Shabad inflates as its Gurmukhi loads. All
of these move the Gurbani out from under the reader unless something holds it.
`useAkhandpattScroll` runs three short correction loops for this. They look
similar but do different jobs:

| Loop                                            | Triggered by                                         | Corrects                                                 | Stops when                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `startSeekSettle`                               | Opening or seeking to a line                         | Pins that verse to its target position on screen         | A fixed window, plus a one-shot `document.fonts.ready` re-pin for a cold font load that finishes later |
| `startAnchorSettle`                             | A Shabad prepended above the reader                  | Adds the measured growth above the anchor to `scrollTop` | The height holds steady for a run of frames, after a minimum floor and under a cap                     |
| The viewport repair, inside the main frame loop | The container resizing, or `layoutRevision` changing | Re-resolves the held content anchor to a scroll position | `scrollHeight` holds steady, or the backstop expires                                                   |

## Who moves the deck

Every change to the scroll position goes through `setScrollTop`, or
`writeScrollPosition` beneath it; a caller that assigned `container.scrollTop`
directly would lose the sub-pixel fraction (see "Smoothness on the projection"
below). Six movers ask for a position. What keeps them apart is what each one
checks before it writes — `requestAnimationFrame` gives no ordering between
separately registered callbacks, so they cannot rely on running in a fixed order.

| Mover | Runs | Stands down for |
| --- | --- | --- |
| the scroll step | every frame while playing | a pause, a wheel gesture, a seek |
| the wheel glide | every frame while easing to where the wheel asked | nothing; it is the gesture, and cancels the seek settle as it starts |
| a seek | once, when a verse is chosen | nothing; it cancels the anchor settle first |
| the seek settle | a short run of frames after a seek | nothing; it is the seek the others stand down for |
| the viewport repair | every frame while the layout is unsettled | a wheel gesture, a seek |
| the anchor settle | a short run of frames after a Shabad is prepended | nothing |

## Smoothness on the projection

Two things make the projection harder to scroll smoothly than the operator's own
preview. Both showed up by eye on real hardware first and only made sense in code
later, and `scroll-motion.js` holds the arithmetic for each.

The projection is a follower. The preview broadcasts an anchor every frame
while the projection also integrates its own velocity, so one scroll position has
two writers. The anchor is re-resolved through different typography each frame,
so it disagrees with the local integration by around a pixel either way at
random; applied in full, that reads as a stutter. The projection therefore moves
a fraction of the way towards it (`SYNC_CORRECTION_GAIN`), snapping only when the
disagreement is too large to be noise (`SYNC_SNAP_RATIO`) or when its own loop is
not running.

`scrollTop` can only address a whole physical pixel. At 3.33px/frame a 1x
display renders 3, 4, 3, 3, 4, plainly visible at reading speed. A 2x laptop
screen has a 0.5px quantum and does not show it, so the fault is invisible on
the machine most operators develop and rehearse on. The whole pixels go to
`scrollTop`, where every measurement in the hook still finds them, and the
remainder is carried as a `translateY` on the content wrapper, which paints at
sub-pixel precision. A transform is purely visual, so `scrollHeight`,
`offsetTop` and the anchor geometry are untouched.

## When the reading position is forgotten

`reading-position.js` answers "where had this reading got to?" without knowing
why it is being asked, so the hook can tell a remount (which should resume) from
a new intention (which must not). It is dropped in three cases: the reader opens
a different Shabad, they select a verse the deck has already pruned away, or they
leave Akhand Paatth view. All three are asserted in
`test/viewer/akhandpatt/reading-position.test.js`.

## The frame loop

The scroll step and the anchor loop are separate `requestAnimationFrame`
callbacks, so style is recalculated twice per frame. They stay separate because
the order between them does not matter: both were shown to land in the same
place whichever runs first, in `scroll-motion.test.js` under "two loops moving
the deck in the same frame". Merging them would save one style recalculation per
frame.

`verse-elements.js` re-runs `querySelectorAll` each frame rather than caching a
node list, which every mount, prune, reflow and setting change would invalidate.

## Reading past a wide gap

Shabad ids ascend, but a source does not own one unbroken run of them. Along the
ascending id space the source changes ten times, so most sources hold several
blocks with other sources' blocks in between. A reading stops when the next
populated id belongs to a different source, which means it covers the block it
started in.

For the two sources anyone reads continuously that is the whole thing. The
SGGS is one block, 1 to 5540, and Dasam Bani is one block, 7402 to 12808. Three
smaller sources are split, and a reading of them ends at the first block
boundary:

| Source                                     | Reading stops at | Reached | Source holds |
| ------------------------------------------ | ---------------- | ------- | ------------ |
| Bhai Nand Lal Ji Vaaran                    | 30081            | 81      | 597          |
| Codes of Conduct and Other Panthic Sources | 31040            | 37      | 56           |
| Bhai Gurdas Ji Vaaran                      | 40913            | 911     | 1595         |

`MAX_SHABAD_ID_GAP` does not cause this and widening it does not help: the ids
beyond each of those boundaries exist and are populated, they simply belong to
another source. None of the three is read as an Akhand Paatth, and the operator
can open the next Shabad by hand and carry on, so it is a known limit, not a bug
being papered over.

Closing it means asking the database for the next id **in a given source**
rather than probing forward. That is one query, but not a drop-in replacement:
each source also carries a few curated extracts of Gurbani the reader has
already passed, indexed far above its body for the Banis feature. The SGGS has
four, the nearest at 333375 (Anand Sahib). An exact next-id query would carry a
completed reading of the SGGS into those instead of ending it at 5540, so it
would need pairing with a rule that recognises them.

## Debugging a scroll problem

From the DevTools console of the viewer window (or the preview `<webview>`):

```js
window.__akhandDebug = true; // start recording
// ...reproduce the problem...
copy(window.__akhandLog); // timestamped deck operations
window.__akhandDebug = false; // stop
```

Line the timestamps up against a sampled `scrollTop` to see which operation moved
the scroll position and by how much.

## Tests

`test/viewer/akhandpatt/` covers the anchor round-trip, the window model and the
speed/timing contracts. Most of those suites run under Node rather than jsdom:
jsdom implements no layout, so a geometry assertion would pass there without
proving the behaviour. Those suites use an explicit fake deck (`deck-fixture.js`)
instead. The suites that drive the real hook do need a DOM and opt into jsdom
with a `@jest-environment jsdom` docblock, supplying geometry themselves and
pumping the animation queue by hand so frame ordering is deterministic.

Two suites sit outside that folder, because what they guard is not scroll
arithmetic:

- `test/navigator/viewer-entry-points.test.js`: every route into the viewer
  leaves the mode flags in a state the deck will actually draw. It reads source
  and matches the callers that switch on a content source, so a new route
  written the same way as the existing ones fails the test if it forgets the
  flag. A route that reached the store some other way would not be seen.
- `test/launchpad/reading-keys.test.js`: the arrow keys step verses in the slide
  view and do nothing during a continuous reading; Space asks for the home verse
  in the slide view, plays and pauses a reading, and puts a Quick Insert away
  without moving the reading. It renders the real `Launchpad` under jsdom and
  dispatches real key events.
