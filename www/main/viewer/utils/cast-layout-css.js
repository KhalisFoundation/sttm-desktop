// Layout rules sent along with every cast. The deployed Chromecast receiver
// doesn't know about #viewer-container-slide-wrapper, so without these the
// slide collapses to the top of the TV and long lines run off the edge. The
// receiver puts the message straight into its page, so a <style> in it applies.
export const CAST_LAYOUT_CSS = `
#viewer, .viewer-wrapper {
  height: 100%;
  overflow: hidden;
}
.shabad-deck {
  height: 100vh;
  overflow: hidden;
}
#viewer-container-slide-wrapper {
  height: 100% !important;
  padding: 0 !important;
  width: 100% !important;
}
.verse-slide-wrapper {
  height: 100%;
  width: 100%;
}
.verse-slide {
  padding: 20px 10px calc(3.5vh + 28px);
}
.verse-slide > * {
  max-width: 100%;
  overflow-wrap: break-word;
}
#viewer-logo {
  z-index: 12;
}
`;
