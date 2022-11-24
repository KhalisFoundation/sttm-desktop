export const filters = (allSearchedVerses, currentWriter, currentRaag, writerArray, raagArray) => {
  let filteredResult = allSearchedVerses;

  // filteres searchedData with selected currentWriter
  if (currentWriter !== 'all' && currentWriter !== 'others') {
    filteredResult = allSearchedVerses.filter((verse) => verse.writer.includes(currentWriter));
  } else if (currentWriter !== 'all' && currentWriter === 'others') {
    filteredResult = allSearchedVerses.filter((verse) =>
      writerArray.every((writer) => !verse.writer.includes(writer.value)),
    );
  }

  // filters searchedData with selected currentRaag
  if (currentRaag !== 'all' && currentRaag !== 'others') {
    filteredResult = filteredResult.filter((verse) => {
      if (!verse.raag) {
        return false;
      }
      return verse.raag.includes(currentRaag);
    });
  } else if (currentRaag !== 'all' && currentRaag === 'others') {
    const allRaags = raagArray;
    filteredResult = filteredResult.filter((verse) => {
      if (!verse.raag) {
        return true;
      }
      return allRaags.every((raag) => !verse.raag.includes(raag.value));
    });
  }

  return filteredResult;
};
