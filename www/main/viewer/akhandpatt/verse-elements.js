const VERSE_SELECTOR = '[data-verseid]';

export const mountedVerses = (container) => container.querySelectorAll(VERSE_SELECTOR);

export const verseElement = (container, verseId) =>
  container.querySelector(`[data-verseid="${verseId}"]`);

export const enclosingVerse = (element) => element && element.closest(VERSE_SELECTOR);

export const verseIdOf = (element) => Number(element.dataset.verseid);
