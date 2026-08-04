export const createWindow = (shabadId, verses) => ({
  segments: [{ shabadId, count: verses.length }],
  verses: [...verses],
});

export const appendShabad = (shabadWindow, shabadId, verses) => {
  if (!verses.length) {
    return shabadWindow;
  }
  return {
    segments: [...shabadWindow.segments, { shabadId, count: verses.length }],
    verses: [...shabadWindow.verses, ...verses],
  };
};

// Prepending shifts the viewport; the caller restores the scroll position afterwards.
export const prependShabad = (shabadWindow, shabadId, verses) => {
  if (!verses.length) {
    return shabadWindow;
  }
  return {
    segments: [{ shabadId, count: verses.length }, ...shabadWindow.segments],
    verses: [...verses, ...shabadWindow.verses],
  };
};

// Restore the viewport from DOM geometry after removing variable-height verses above it.
export const dropFirstSegment = (shabadWindow) => {
  if (shabadWindow.segments.length <= 1) {
    return shabadWindow;
  }
  const [first, ...rest] = shabadWindow.segments;
  return {
    segments: rest,
    verses: shabadWindow.verses.slice(first.count),
  };
};

export const dropLastSegment = (shabadWindow) => {
  if (shabadWindow.segments.length <= 1) {
    return shabadWindow;
  }
  const last = shabadWindow.segments[shabadWindow.segments.length - 1];
  return {
    segments: shabadWindow.segments.slice(0, -1),
    verses: shabadWindow.verses.slice(0, shabadWindow.verses.length - last.count),
  };
};

export const lastShabadId = (shabadWindow) => {
  if (!shabadWindow.segments.length) {
    return null;
  }
  return shabadWindow.segments[shabadWindow.segments.length - 1].shabadId;
};

export const firstShabadId = (shabadWindow) => {
  if (!shabadWindow.segments.length) {
    return null;
  }
  return shabadWindow.segments[0].shabadId;
};

// Segment counts map each mounted verse back to its Shabad.
export const shabadIdOfVerse = (shabadWindow, verseId) => {
  const index = shabadWindow.verses.findIndex((verse) => verse.ID === verseId);
  if (index === -1) {
    return null;
  }
  let firstIndexOfSegment = 0;
  for (let i = 0; i < shabadWindow.segments.length; i += 1) {
    firstIndexOfSegment += shabadWindow.segments[i].count;
    if (index < firstIndexOfSegment) {
      return shabadWindow.segments[i].shabadId;
    }
  }
  return null;
};
