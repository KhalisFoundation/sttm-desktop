import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import isOnline from 'is-online';
import { useStoreActions, useStoreState } from 'easy-peasy';

import { fetchFavShabad, removeFromFav } from '../utils';
import banidb from '../../../banidb';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

export const FavoritePane = ({ className }) => {
  const {
    activeShabadId,
    initialVerseId,
    versesRead,
    isCeremonyBani,
    isSundarGutkaBani,
    homeVerse,
    activeVerseId,
    singleDisplayActiveTab,
    favShabad,
  } = useStoreState((state) => state.navigator);
  const {
    setActiveShabadId,
    setInitialVerseId,
    setVersesRead,
    setIsCeremonyBani,
    setIsSundarGutkaBani,
    setHomeVerse,
    setActiveVerseId,
    setSingleDisplayActiveTab,
    setFavShabad,
  } = useStoreActions((state) => state.navigator);

  const { userToken } = useStoreState((state) => state.app);
  const [parsedFav, setParsedFav] = useState([]);
  const [isFetching, setFetching] = useState(false);
  const [errorMessage, setError] = useState('');

  const initialFetch = async () => {
    const onlineValue = await isOnline();
    if (onlineValue) {
      if (userToken) {
        try {
          setError('');
          setFetching(true);
          const data = await fetchFavShabad(userToken);
          setFetching(false);
          setFavShabad([...data]);
        } catch (err) {
          setFavShabad([]);
          setError(i18n.t('FAV_SHABAD.API_ERR'));
        }
      } else {
        setError(i18n.t('FAV_SHABAD.LOGGED_OUT'));
        setFavShabad([]);
      }
    } else {
      setError(i18n.t('FAV_SHABAD.INTERNET_ERR'));
    }
  };

  useEffect(() => {
    initialFetch();
  }, [userToken]);

  const deleteFromFav = (inputElement) => {
    const favShabadIndex = favShabad.findIndex(
      (element) => element.shabad_id === inputElement.shabadId,
    );
    removeFromFav(inputElement.shabadId, userToken);

    if (favShabadIndex >= 0) {
      favShabad.splice(favShabadIndex, 1);
      setFavShabad([...favShabad]);
    }
  };

  const openShabadFromFav = (shabadId, verseId) => {
    if (singleDisplayActiveTab !== 'shabad') {
      setSingleDisplayActiveTab('shabad');
    }
    if (shabadId !== activeShabadId) {
      setActiveShabadId(shabadId);

      if (verseId !== activeVerseId) {
        setActiveVerseId(verseId);
      }

      if (verseId !== initialVerseId) {
        setInitialVerseId(verseId);
      }

      if (verseId !== homeVerse) {
        setHomeVerse(verseId);
      }

      if (versesRead !== []) {
        setVersesRead([]);
      }

      if (isSundarGutkaBani) {
        setIsSundarGutkaBani(false);
      }

      if (isCeremonyBani) {
        setIsCeremonyBani(false);
      }
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const promises = favShabad.map(async (element) => {
        const elementDate = new Date(element.created_at);
        const dateString = elementDate.toLocaleDateString('en-us', {
          day: 'numeric',
          year: 'numeric',
          month: 'short',
        });
        const timeString = elementDate.toLocaleTimeString('en-us', {
          hour: 'numeric',
          minute: 'numeric',
        });
        const row = await banidb.getVerse(element.shabad_id, element.verse_id);
        return {
          date: dateString,
          time: timeString,
          shabadId: element.shabad_id,
          verseId: element.verse_id,
          verse: row,
          id: element.id,
        };
      });
      Promise.all(promises).then((data) => {
        setParsedFav(data);
      });
    };
    fetchData();
  }, [favShabad]);

  return (
    <div className={`fav-results ${className}`}>
      <p className="error">{errorMessage}</p>
      {isFetching && <div className="sttm-loader" />}
      {parsedFav.map((element, index) => {
        const { shabadId, verseId, date, time, verse, id } = element;
        return (
          <div className="fav-shabad-container" key={`fav-shabad-${index}`}>
            <div className="fav-shabad-text">
              <p
                className="fav-item gurmukhi"
                key={`favshabad-${index}`}
                data-id={id}
                onClick={() => {
                  openShabadFromFav(shabadId, verseId);
                }}
              >
                {verse}
              </p>
            </div>
            <div className="fav-shabad-options">
              <p className="date">{date}</p>
              <p className="time">{time}</p>
              <button
                onClick={() => {
                  deleteFromFav(element);
                }}
              >
                <i className="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

FavoritePane.propTypes = {
  className: PropTypes.string,
};
