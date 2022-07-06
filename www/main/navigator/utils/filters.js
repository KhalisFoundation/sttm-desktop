export const filters = (allSearchedVerses, currentWriter, currentRaag, writerArray, raagArray) => {
  let filteredResult = allSearchedVerses;

  // filteres searchedData with selected currentWriter
  if (currentWriter !== 'all' && currentWriter !== 'others') {
    filteredResult = allSearchedVerses.filter(verse => {
      return verse.writer.includes(currentWriter);
    });
  } else if (currentWriter !== 'all' && currentWriter === 'others') {
    const allWriters = writerArray.filter(d => d !== 'all' && d !== 'others');
    filteredResult = allSearchedVerses.filter(verse => {
      return !allWriters.includes(verse.writer);
    });
  }

  // filters searchedData with selected currentRaag
  if (currentRaag !== 'all' && currentRaag !== 'others') {
    filteredResult = filteredResult.filter(verse => {
      if (!verse.raag) {
        return false;
      }
      return verse.raag.includes(currentRaag);
    });
  } else if (currentRaag !== 'all' && currentRaag === 'others') {
    const allRaags = raagArray;
    filteredResult = filteredResult.filter(verse => {
      if (!verse.raag) {
        return true;
      }
      return !allRaags.includes(verse.raag);
    });
  }

  return filteredResult;
};
