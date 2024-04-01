import PropTypes from 'prop-types';
import React, { useState, useEffect } from 'react';

import { Virtuoso } from 'react-virtuoso';
import { loadShabad, loadBani, loadCeremony } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';

const baniLengthCols = {
  short: 'existsSGPC',
  medium: 'existsMedium',
  long: 'existsTaksal',
  extralong: 'existsBuddhaDal',
};

export const ShabadText = ({ shabadId, baniType, baniLength }) => {
  const [filteredItems, setFilteredItems] = useState([]);

  const filterRequiredVerseItems = (verses) => {
    let versesNew;
    let currentLine = 0;
    try {
      versesNew = verses.flat(1);
    } catch (error) {
      versesNew = verses;
    }
    const checkPauri = versesNew.filter((verse) => /]\d*]/.test(verse.Gurmukhi));
    const regex = checkPauri.length > 1 ? /]\d*]/ : /]/;
    return versesNew
      ? versesNew.map((verse, index) => {
          if (verse) {
            const verseObj = {
              ID: index,
              verseId: verse.ID,
              verse: verse.Gurmukhi,
              english: verse.English ? verse.English : '',
              lineNo: currentLine,
              crossPlatformId: verse.crossPlatformID ? verse.crossPlatformID : '',
            };
            if (regex.test(verse.Gurmukhi)) {
              currentLine++;
            }
            return verseObj;
          }
          return {};
        })
      : [];
  };

  useEffect(() => {
    if (baniType === 'shabad') {
      loadShabad(shabadId).then((verseList) => {
        if (verseList.length) {
          setFilteredItems(filterRequiredVerseItems(verseList));
        }
      });
    } else if (baniType === 'bani') {
      loadBani(shabadId, baniLengthCols[baniLength]).then((verseList) => {
        if (verseList.length) {
          setFilteredItems(filterRequiredVerseItems(verseList));
        }
      });
    } else if (baniType === 'ceremony') {
      loadCeremony(shabadId).then((verseList) => {
        if (verseList.length) {
          setFilteredItems(filterRequiredVerseItems(verseList));
        }
      });
    }
  }, [shabadId, baniType, baniLength]);

  const changeHomeVerse = () => {
    console.log('changeHomeVerse');
  };

  const updateTraversedVerse = () => {
    console.log('updateTraversedVerse');
  };

  return (
    <div className="shabad-list">
      <div className="verse-block">
        <Virtuoso
          data={filteredItems}
          totalCount={filteredItems.length}
          itemContent={(index, verseObj) => {
            const { verseId, verse, english } = verseObj;
            return (
              <ShabadVerse
                key={index}
                activeVerse={filteredItems[0]}
                isHomeVerse={false}
                lineNumber={index}
                versesRead={[]}
                verse={verse}
                englishVerse={english}
                verseId={verseId}
                changeHomeVerse={changeHomeVerse}
                updateTraversedVerse={updateTraversedVerse}
              />
            );
          }}
        />
      </div>
    </div>
  );
};

ShabadText.propTypes = {
  shabadId: PropTypes.number,
  initialVerseId: PropTypes.number,
  baniType: PropTypes.string,
  baniLength: PropTypes.string,
};
