import { remote } from 'electron';

const { i18n } = remote.require('./app');

export const filters = (allSearchedVerses, currentWriter, currentRaag, currentSource) => {
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
    const allWriters = [
      i18n.t(`SEARCH.WRITERS.GURU_AMAR_DAS.VALUE`),
      i18n.t(`SEARCH.WRITERS.GURU_ANGAD_DEV.VALUE`),
      i18n.t(`SEARCH.WRITERS.GURU_ARJAN_DEV.VALUE`),
      i18n.t(`SEARCH.WRITERS.GURU_HAR_RAI.VALUE`),
      i18n.t(`SEARCH.WRITERS.GURU_HARGOBIND.VALUE`),
      i18n.t(`SEARCH.WRITERS.GURU_NANAK_DEV.VALUE`),
      i18n.t(`SEARCH.WRITERS.GURU_RAM_DAS.VALUE`),
      i18n.t(`SEARCH.WRITERS.GURU_TEGH_BAHADUR.VALUE`),
    ];
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
    const allRaags = [
      i18n.t(`SEARCH.RAAGS.ASA.VALUE`),
      i18n.t(`SEARCH.RAAGS.GUJARI.VALUE`),
      i18n.t(`SEARCH.RAAGS.GAURI_DEEPAKI.VALUE`),
      i18n.t(`SEARCH.RAAGS.DHANASARI.VALUE`),
      i18n.t(`SEARCH.RAAGS.GAURI_POORABI.VALUE`),
      i18n.t(`SEARCH.RAAGS.SRI.VALUE`),
      i18n.t(`SEARCH.RAAGS.MAJH.VALUE`),
      i18n.t(`SEARCH.RAAGS.GAURI_GAURAIREE.VALUE`),
      i18n.t(`SEARCH.RAAGS.GAURI.VALUE`),
      i18n.t(`SEARCH.RAAGS.GAURI_DAKHANI.VALUE`),
    ];
    filteredResult = filteredResult.filter(verse => {
      if (!verse.raag) {
        return true;
      }
      return !allRaags.includes(verse.raag);
    });
  }

  // filters searchData from selected currentSource
  if (currentSource !== allSourceText) {
    // TODO: refactor the switch state and compare the source from en.json
    switch (currentSource) {
      case 'G':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === i18n.t(`SEARCH.SOURCES.GURU_GRANTH_SAHIB.VALUE`);
        });
        break;
      case 'D':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === i18n.t(`SEARCH.SOURCES.DASAM_GRANTH.VALUE`);
        });
        break;
      case 'B':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === i18n.t(`SEARCH.SOURCES.GURDAS_VAARAN.VALUE`);
        });
        break;
      case 'N':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === i18n.t(`SEARCH.SOURCES.NAND_LAL_VAARAN.VALUE`);
        });
        break;
      case 'A':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === i18n.t(`SEARCH.SOURCES.AMRIT_KEERTAN.VALUE`);
        });
        break;
      case 'S':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === i18n.t(`SEARCH.SOURCES.GURDAS_JI_VAARAN.VALUE`);
        });
        break;
      case 'R':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === i18n.t(`SEARCH.SOURCES.REHATNAMAS.VALUE`);
        });
        break;
      default:
        break;
    }
  }
  return filteredResult;
};
