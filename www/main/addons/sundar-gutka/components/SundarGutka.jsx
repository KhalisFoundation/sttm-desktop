import React, { useState } from 'react';
import PropTypes from 'prop-types';
import anvaad from 'anvaad-js';
import { useStoreState, useStoreActions } from 'easy-peasy';

import { Switch, Overlay } from '../../../common/sttm-ui';
import ExtraBani from './ExtraBani';
import { convertToHyphenCase } from '../../../common/utils';
import { nitnemBaniIds, popularBaniIds } from '../../../common/constants';

import useLoadBani from '../hooks/use-load-bani';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');
const { i18n } = remote.require('./app');

const SundarGutka = ({ isShowTranslitSwitch = false, onScreenClose }) => {
  const { isSundarGutkaBani, sundarGutkaBaniId, isCeremonyBani, singleDisplayActiveTab } =
    useStoreState((state) => state.navigator);
  const {
    setIsSundarGutkaBani,
    setSundarGutkaBaniId,
    setIsCeremonyBani,
    setSingleDisplayActiveTab,
  } = useStoreActions((state) => state.navigator);

  const { isLoadingBanis, banis } = useLoadBani();
  const [isTranslit, setTranslitState] = useState(false);
  const [isEngTransliterated, setEngTransliterate] = useState(false);

  const nitnemBanis = [];
  const popularBanis = [];
  const title = i18n.t('TOOLBAR.SUNDAR_GUTKA');
  const hyphenedTitle = convertToHyphenCase(title.toLowerCase());
  const overlayClassName = `ui-${hyphenedTitle}`;
  const blockListId = `${hyphenedTitle}-banis`;
  const blockListItemClassName = `${hyphenedTitle}-bani`;
  const taggedBanis = banis.map((bani) => {
    const b = bani;
    b.baniTag = '';

    if (nitnemBaniIds.includes(b.id)) {
      b.baniTag = 'nitnem';
      nitnemBanis.push(b);
    }
    if (popularBaniIds.includes(b.id)) {
      b.baniTag = 'popular';
      popularBanis.push(b);
    }

    return b;
  });

  const loadBani = (baniId) => {
    if (isCeremonyBani) {
      setIsCeremonyBani(false);
    }

    if (!isSundarGutkaBani) {
      setIsSundarGutkaBani(true);
    }

    if (sundarGutkaBaniId !== baniId) {
      setSundarGutkaBaniId(baniId);
    }

    if (singleDisplayActiveTab !== 'shabad') {
      setSingleDisplayActiveTab('shabad');
    }

    analytics.trackEvent({
      category: 'sundar-gutka',
      action: 'bani',
      label: baniId,
    });
    onScreenClose();
  };

  return (
    <Overlay onScreenClose={onScreenClose}>
      <div className={`addon-wrapper ${hyphenedTitle}-wrapper`}>
        <div className={`bani-list overlay-ui ${overlayClassName}`}>
          {isLoadingBanis ? (
            <div className="sttm-loader" />
          ) : (
            <>
              <header className="navigator-header">
                {title}
                <div className="transliterate-eng">
                  <span>{i18n.t('SETTINGS.ENGLISH_LANGUAGE')} </span>
                  <div className="switch xs-small">
                    <input
                      id="translate-eng"
                      type="checkbox"
                      checked={isEngTransliterated}
                      onChange={() => {
                        const newState = !isEngTransliterated;
                        setEngTransliterate(newState);
                      }}
                    />
                    <label htmlFor="translate-eng" />
                  </div>
                </div>
              </header>
              {isShowTranslitSwitch && (
                <Switch
                  controlId="translit-switch"
                  className="translit-switch"
                  onToggle={setTranslitState}
                  value={isTranslit}
                />
              )}

              <section className="blocklist">
                <ul id={blockListId} className={!isEngTransliterated && 'gurmukhi'}>
                  {taggedBanis.map((bani) => (
                    <li
                      key={bani.name}
                      className={blockListItemClassName}
                      onClick={() => loadBani(bani.id)}
                    >
                      <span className={`tag tag-${bani.baniTag}`} />
                      <span className={isEngTransliterated && 'english-bani'}>
                        {isEngTransliterated ? anvaad.translit(bani.name) : bani.name}
                      </span>
                      <span className="translit-bani">{anvaad.translit(bani.name)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>

        {!isLoadingBanis && (
          <div className={`bani-extras overlay-ui ${overlayClassName}`}>
            {nitnemBanis.length > 0 && (
              <ExtraBani
                title="Nitnem Banis"
                banis={nitnemBanis}
                loadBani={loadBani}
                isEngTransliterated={isEngTransliterated}
              />
            )}
            {popularBanis.length > 0 && (
              <ExtraBani
                title="Popular Banis"
                banis={popularBanis}
                loadBani={loadBani}
                isEngTransliterated={isEngTransliterated}
              />
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
};

SundarGutka.propTypes = {
  isShowTranslitSwitch: PropTypes.bool,
  onScreenClose: PropTypes.func,
};

export default SundarGutka;
