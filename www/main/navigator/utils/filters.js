import { remote } from 'electron';

const { i18n } = remote.require('./app');

export const filters = (
  allSearchedVerses,
  currentWriter,
  currentRaag,
  currentSource,
  writerArray,
  raagArray,
) => {
  let filteredResult = allSearchedVerses;
  const allWriterText = i18n.t(`SEARCH.WRITERS.ALL_WRITERS.VALUE`);
  const otherWriterText = i18n.t(`SEARCH.WRITERS.OTHERS.VALUE`);
  const allRaagText = i18n.t(`SEARCH.RAAGS.ALL_RAAGS.VALUE`);
  const otherRaagText = i18n.t(`SEARCH.RAAGS.OTHERS.VALUE`);
  const allSourceText = i18n.t(`SEARCH.SOURCES.ALL_SOURCES.VALUE`);

  // filteres searchedData with selected currentWriter
  if (currentWriter !== allWriterText && currentWriter !== otherWriterText) {
    filteredResult = allSearchedVerses.filter(verse => {
      return verse.writer.includes(currentWriter);
    });
  } else if (currentWriter !== allWriterText && currentWriter === otherWriterText) {
    const allWriters = writerArray.filter(d => d !== allWriterText && d !== otherWriterText);
    filteredResult = allSearchedVerses.filter(verse => {
      return !allWriters.includes(verse.writer);
    });
  }

  // filters searchedData with selected currentRaag
  if (currentRaag !== allRaagText && currentRaag !== otherRaagText) {
    filteredResult = filteredResult.filter(verse => {
      if (!verse.raag) {
        return false;
      }
      return verse.raag.includes(currentRaag);
    });
  } else if (currentRaag !== allRaagText && currentRaag === otherRaagText) {
    const allRaags = raagArray;
    filteredResult = filteredResult.filter(verse => {
      if (!verse.raag) {
        return true;
      }
      return !allRaags.includes(verse.raag);
    });
  }

  // filters searchData from selected currentSource
  if (currentSource !== allSourceText) {
    filteredResult = filteredResult.filter(verse => {
      return verse.source === currentSource;
    });
  }

  return filteredResult;
};
