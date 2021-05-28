export const filters = (allSearchedVerses, currentWriter, currentRaag, currentSource) => {
  let filteredResult = allSearchedVerses;

  // filteres searchedData with selected currentWriter
  if (currentWriter !== 'ALL' && currentWriter !== 'Others') {
    filteredResult = allSearchedVerses.filter(verse => {
      return verse.writer.includes(currentWriter);
    });
  } else if (currentWriter !== 'ALL' && currentWriter === 'Others') {
    const allWriters = [
      'Guru Amar Das Ji',
      'Guru Angad Dev Ji',
      'Guru Arjan Dev Ji',
      'Guru Har Rai Ji',
      'Guru Hargobind Ji',
      'Guru Nanak Dev Ji',
      'Guru Ram Das Ji',
      'Guru Tegh Bahadur Ji',
    ];
    filteredResult = allSearchedVerses.filter(verse => {
      return !allWriters.includes(verse.writer);
    });
  }

  // filters searchedData with selected currentRaag
  if (currentRaag !== 'ALL' && currentRaag !== 'Others') {
    filteredResult = filteredResult.filter(verse => {
      if (!verse.raag) {
        return false;
      }
      return verse.raag.includes(currentRaag);
    });
  } else if (currentRaag !== 'ALL' && currentRaag === 'Others') {
    const allRaags = [
      'Raag Aasaa',
      'Raag Gujari',
      'Raag Gauree Deepaki',
      'Raag Dhanasri',
      'Raag Gauree Poorabi',
      'Raag Sri',
      'Raag Maajh',
      'Raag Gauree Guarairee',
      'Raag Gauree',
      'Gauree Dakhani',
    ];
    filteredResult = filteredResult.filter(verse => {
      if (!verse.raag) {
        return true;
      }
      return !allRaags.includes(verse.raag);
    });
  }

  // filters searchData from selected currentSource
  if (currentSource !== 'all') {
    filteredResult = filteredResult.filter(verse => {
      return verse.source === currentSource;
    });
  }
  return filteredResult;
};
