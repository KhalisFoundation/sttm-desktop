const styles = `
div.shabad-deck.single-display-mode {
    padding-left: initial;
    padding-top: initial;
}
.slide-quicktools, .slide-paddingtools {
   display: none;
 }
.verse-slide {
  padding-top: 40px !IMPORTANT
}
div.autoplay-icon-container {
  display: none
}
svg.viewer-logo {
  left: 12px !IMPORTANT;
}

/* Display 2 only — layout; theme-* from bundle owns bg/colors (no solid grey override). */
body.viewer-pane-projection,
body.viewer-pane-projection #viewer-container,
body.viewer-pane-projection #root {
  height: 100% !important;
  width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}

/*
 * Phase 1 (Bug A): letterbox shells — strip theme bg-image only (clouds/cyan bleed).
 * Do NOT force a fixed plate color (#f5f5f5 showed as white bands on other themes).
 * PaneProjection JS copies live .pane background onto html/body/screen so contain-scale
 * edges match list chrome for every theme (no visible letterbox bands).
 */
html:has(body.viewer-pane-projection),
body.viewer-pane-projection,
body.viewer-pane-projection #viewer-container,
body.viewer-pane-projection #root,
.pane-projection-screen {
  background-image: none !important;
  background-size: auto !important;
  background-position: initial !important;
  background-repeat: no-repeat !important;
  background-attachment: scroll !important;
}

.pane-projection-screen {
  align-items: center !important;
  box-sizing: border-box;
  display: flex !important;
  height: 100% !important;
  justify-content: center !important;
  overflow: hidden !important;
  pointer-events: none;
  width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
}
.pane-projection-stage {
  flex: none;
  transform-origin: center center;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
  background-image: none !important;
  background-color: transparent !important;
}
.pane-projection-stage .pane-container.shabad-pane {
  box-sizing: border-box;
  display: flex;
  flex: none;
  flex-direction: column;
  height: 100% !important;
  max-height: none !important;
  min-height: 0;
  padding: 0 !important;
  margin: 0 !important;
  width: 100% !important;
}
.pane-projection-stage .pane {
  display: flex;
  flex-direction: column;
  height: 100% !important;
  max-height: none !important;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
}
.pane-projection-stage .pane-header {
  display: none !important;
  height: 0 !important;
  min-height: 0 !important;
  overflow: hidden !important;
  padding: 0 !important;
  margin: 0 !important;
  flex: 0 0 0 !important;
}
.pane-projection-stage .pane-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100% !important;
  max-height: none !important;
  min-height: 0;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
}
.pane-projection-stage .shabad-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100% !important;
  min-height: 0;
  overflow: hidden;
  margin: 0 !important;
  padding: 0 !important;
}
.pane-projection-stage .verse-block {
  flex: 1 1 auto;
  height: 100% !important;
  max-height: none !important;
  min-height: 0;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  scrollbar-width: none;
  margin: 0 !important;
  padding: 0 !important;
  position: relative;
}
.pane-projection-stage .verse-block::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
/* Full list container (Display 2) — natural height so last rows can scroll into view */
.pane-projection-stage .verse-block .shabad-list-full {
  width: 100%;
  max-height: none !important;
}
/* Legacy Virtuoso path (if still mounted): size root only — never force every child to 100% */
.pane-projection-stage .verse-block > div[data-testid="virtuoso-scroller"],
.pane-projection-stage .verse-block [data-virtuoso-scroller] {
  height: 100% !important;
  max-height: none !important;
  overflow-y: auto !important;
  scrollbar-width: none;
}
.pane-projection-stage .verse-block [data-virtuoso-scroller]::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
.pane-projection-stage .verse-block [data-viewport-type] {
  max-height: none !important;
}
/* Viewer lacks controller font CSS — restore Gurmukhi on Display 2.
   --projection-text-scale shrinks multi-pane text toward Presentation density.
   The stage itself is display-shaped, so the verse list can scroll. */
.pane-projection-stage .gurmukhi {
  font-family: 'gurbaniakhar' !important;
  font-size: calc(1.1em * var(--projection-text-scale, 1));
}
.pane-projection-stage .verse-content {
  font-size: calc(1em * var(--projection-text-scale, 1));
  line-height: 1.3;
}
/* Keep default list row sizing (scaled via stage transform — do not shrink font) */
.pane-projection-stage .shabad-pane-active {
  background-color: rgba(0, 120, 215, 0.18) !important;
}
`;

module.exports = { styles };

