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
    // TODO: refactor the switch state and compare the source from en.json
    switch (currentSource) {
      case 'G':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === 'Sri Guru Granth Sahib Ji';
        });
        break;
      case 'D':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === 'Dasam Bani';
        });
        break;
      case 'B':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === 'Bhai Gurdas Ji Vaaran';
        });
        break;
      case 'N':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === 'Bhai Nand Lal Ji Vaaran';
        });
        break;
      case 'A':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === 'Amrit Keertan';
        });
        break;
      case 'S':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === 'Bhai Gurdas Singh Ji Vaaran';
        });
        break;
      case 'R':
        filteredResult = filteredResult.filter(verse => {
          return verse.source === 'Codes of Conduct and Other Panthic Sources';
        });
        break;
      default:
        break;
    }
  }
  return filteredResult;
};
