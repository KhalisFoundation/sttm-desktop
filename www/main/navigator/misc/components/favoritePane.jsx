import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import isOnline from 'is-online';
import { useStoreActions, useStoreState } from 'easy-peasy';

import { shell } from 'electron';
import { fetchFavShabad, removeFromFav } from '../utils';
import banidb from '../../../banidb';
import { SP_API } from '../../../common/constants/api-urls';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

export const FavoritePane = ({ className, paneId }) => {
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
    pane1,
    pane2,
    pane3,
    activePaneId,
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
    setPane1,
    setPane2,
    setPane3,
    setActivePaneId,
  } = useStoreActions((state) => state.navigator);
  const { currentWorkspace } = useStoreState((state) => state.userSettings);

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

      if (!versesRead.includes(verseId)) {
        setVersesRead([verseId]);
      }

      if (isSundarGutkaBani) {
        setIsSundarGutkaBani(false);
      }

      if (isCeremonyBani) {
        setIsCeremonyBani(false);
      }

      if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
        if (paneId !== activePaneId) setActivePaneId(paneId);
        switch (paneId) {
          case 1:
            setPane1({
              ...pane1,
              content: i18n.t('MULTI_PANE.SHABAD'),
              activeShabad: shabadId,
            });
            break;
          case 2:
            setPane2({
              ...pane2,
              content: i18n.t('MULTI_PANE.SHABAD'),
              activeShabad: shabadId,
            });
            break;
          case 3:
            setPane3({
              ...pane3,
              content: i18n.t('MULTI_PANE.SHABAD'),
              activeShabad: shabadId,
            });
            break;
          default:
            break;
        }
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
      <div className="nologin">
        <p className="error">{errorMessage}</p>
        {!userToken && (
          <button
            className="button"
            onClick={() => {
              shell.openExternal(`${SP_API}/login/sso`);
            }}
          >
            Login
          </button>
        )}
      </div>
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
              <p
                className="date"
                style={
                  currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE') ? { display: 'none' } : {}
                }
              >
                {date}
              </p>
              <p
                className="time"
                style={
                  currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE') ? { display: 'none' } : {}
                }
              >
                {time}
              </p>
              <button
                onClick={() => {
                  deleteFromFav(element);
                }}
              >
                <i className="fa-solid fa-xmark"></i>
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
  paneId: PropTypes.number,
};
