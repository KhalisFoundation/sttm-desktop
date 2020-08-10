import React, { useState } from 'react';
import PropTypes from 'prop-types';

import { Switch, Overlay } from '../../../../sttm-ui';
import ExtraBani from './ExtraBani';
import { convertToHyphenCase } from '../../../../utils';

import useLoadBani from '../hooks/use-load-bani';

const SundarGutka = ({ isShowTranslitSwitch = false, onScreenClose }) => {
  const title = 'Sundar Gutka';
  // const banis = [{ name: 'Sundar Gutka' }];
  const extraBanis = [
    {
      title: 'Nitnem Banis',
      banis: [{ name: 'Nitnem Banis' }],
    },
  ];

  const { isLoadingBanis, banis } = useLoadBani();
  const [isTranslit, setTranslitState] = useState(false);
  const hyphenedTitle = convertToHyphenCase(title.toLowerCase());
  const overlayClassName = `ui-${hyphenedTitle}`;
  const blockListId = `${hyphenedTitle}-banis`;
  const blockListItemClassName = `${hyphenedTitle}-bani`;
  console.log(banis, 'bani data..');

  return (
    <Overlay onScreenClose={onScreenClose}>
      <div className={`${hyphenedTitle}-dialog-wrapper`}>
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
                />
              )}

              <section className="blocklist">
                <ul id={blockListId} className="gurmukhi">
                  {banis.map(b => (
                    <li key={b.name} className={blockListItemClassName}>
                      {b.name}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>

        {!isLoadingBanis && (
          <div className={`bani-extras overlay-ui ${overlayClassName}`}>
            {extraBanis && extraBanis.map((extra, idx) => <ExtraBani key={idx} {...extra} />)}
          </div>
        )}
      </div>
    </Overlay>
  );
};

SundarGutka.propTypes = {
  onScreenClose: PropTypes.func,
  isShowTranslitSwitch: PropTypes.bool,
};

export default SundarGutka;
