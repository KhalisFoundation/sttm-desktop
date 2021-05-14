import React from 'react';
import PropTypes from 'prop-types';
import { useStoreActions } from 'easy-peasy';

const ShabadVerse = ({ verses, onClick }) => {
  console.log(verses);
  const { setTestingState } = useStoreActions(state => state.navigator);

  return (
    <div className="verse-block">
      <div className="result-list">
        <ul>
          {verses.map(({ verse, verseId, shabadId }, index) => (
            <li
              key={verseId}
              value={index}
              className="shabadPane-list"
              onClick={() => onClick(verseId, shabadId)}
            >
              <span className="shabadPane-controls">
                {/* {isRead.map(isRead =>
                  isRead == verse.verseId ? ( */}
                <span>
                  <i className="fa fa-fw fa-check" />
                </span>
                {/* ) : (
                    ''
                  ),
                )} */}
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
};

export default ShabadVerse;
