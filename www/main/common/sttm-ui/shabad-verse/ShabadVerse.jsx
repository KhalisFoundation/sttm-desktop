import React, { useState } from 'react';
import PropTypes from 'prop-types';

const ShabadVerse = ({ verses, onClick }) => {
  const [traversedVerse, setTraversedVerse] = useState([]);

  const updateTraversedVerse = newTraversedVerse => {
    if (!traversedVerse.some(verseId => verseId === newTraversedVerse)) {
      setTraversedVerse([...traversedVerse, newTraversedVerse]);
    }
  };

  return (
    <div className="verse-block">
      <div className="result-list">
        <ul>
          {verses.map(({ verse, verseId }, index) => (
            <li
              key={verseId}
              value={index}
              className="shabadPane-list"
              onClick={() => {
                onClick(verseId);
                updateTraversedVerse(verseId);
              }}
            >
              <span className="shabadPane-controls">
                {traversedVerse.map(
                  isRead =>
                    isRead === verseId && (
                      <span>
                        <i className="fa fa-fw fa-check" />
                      </span>
                    ),
                )}
                {/* {isHome != index ? ( */}
                <span onClick={() => console.log('home')}>
                  <i className="fa fa-home hoverIcon" />
                </span>
                {/* ) : (
                  ''
                )} */}
                {/* {isHome == index ? (
                  <span>
                    <i className="fa fa-fw fa-home" onClick={HandleHome} />
                  </span>
                ) : (
                  ''
                )} */}
              </span>
              <div className="span-color">
                <a className="panktee">
                  <span className="gurmukhi">{verse}</span>
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

ShabadVerse.propTypes = {
  verses: PropTypes.array,
  onClick: PropTypes.func,
};

export default ShabadVerse;
