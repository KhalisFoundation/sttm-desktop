import React, { useState } from 'react';
import PropTypes from 'prop-types';
import anvaad from 'anvaad-js';
import { remote } from 'electron';

import { Switch, Overlay } from '../../../common/sttm-ui';
import ExtraBani from './ExtraBani';
import { convertToHyphenCase } from '../../../common/utils';
import { nitnemBaniIds, popularBaniIds } from '../../../common/constants';

import useLoadBani from '../hooks/use-load-bani';

const { i18n } = remote.require('./app');

const SundarGutka = ({ isShowTranslitSwitch = false, onScreenClose }) => {
  const { isLoadingBanis, banis } = useLoadBani();
  const [isTranslit, setTranslitState] = useState(false);

  const nitnemBanis = [];
  const popularBanis = [];
  const title = i18n.t('TOOLBAR.SUNDAR_GUTKA');
  const hyphenedTitle = convertToHyphenCase(title.toLowerCase());
  const overlayClassName = `ui-${hyphenedTitle}`;
  const blockListId = `${hyphenedTitle}-banis`;
  const blockListItemClassName = `${hyphenedTitle}-bani`;
  const taggedBanis = banis.map(bani => {
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

  return (
    <Overlay onScreenClose={onScreenClose}>
      <div className={`${hyphenedTitle}-wrapper`}>
        <div className={`bani-list overlay-ui ${overlayClassName}`}>
          {isLoadingBanis ? (
            <div className="sttm-loader" />
          ) : (
            <>
              <header className="navigator-header">{title}</header>

              {isShowTranslitSwitch && (
                <Switch
                  controlId="translit-switch"
                  className="translit-switch"
                  onToggle={setTranslitState}
                  value={isTranslit}
                />
              )}

              <section className="blocklist">
                <ul id={blockListId} className="gurmukhi">
                  {taggedBanis.map(b => (
                    <li key={b.name} className={blockListItemClassName}>
                      <span className={`tag tag-${b.baniTag}`} />
                      <span>{b.name}</span>
                      <span className="translit-bani">{anvaad.translit(b.name)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>

        {!isLoadingBanis && (
          <div className={`bani-extras overlay-ui ${overlayClassName}`}>
            {nitnemBanis && (
              <ExtraBani onScreenClose={onScreenClose} title="Nitnem Banis" banis={nitnemBanis} />
            )}
            {popularBanis && (
              <ExtraBani onScreenClose={onScreenClose} title="Popular Banis" banis={popularBanis} />
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
