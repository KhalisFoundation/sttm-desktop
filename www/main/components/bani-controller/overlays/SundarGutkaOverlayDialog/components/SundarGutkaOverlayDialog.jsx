import React, { useState } from 'react';
import PropTypes from 'prop-types';

import { Switch } from '../../../../../sttm-ui';
import DialogWrapper from '../../DialogWrapper';
import ExtraBani from './ExtraBani';
import { convertToHyphenCase } from '../../../../../utils';
import useLoadBani from '../hooks/use-load-bani';

const SundarGutkaOverlayDialog = ({ isShowTranslitSwitch = false, onDialogClose }) => {
  const title = 'Sundar Gutka';
  const banis = [{ name: 'Sundar Gutka' }];
  const extraBanis = [
    {
      title: 'Nitnem Banis',
      banis: [{ name: 'Nitnem Banis' }],
    },
  ];

  const { isLoadingBani, baniData } = useLoadBani();
  const [isTranslit, setTranslitState] = useState(false);
  const hyphenedTitle = convertToHyphenCase(title.toLowerCase());
  const overlayClassName = `ui-${hyphenedTitle}`;
  const blockListId = `${hyphenedTitle}-banis`;
  const blockListItemClassName = `${hyphenedTitle}-bani`;

  return (
    <DialogWrapper onDialogClose={onDialogClose}>
      <div className={`${hyphenedTitle}-dialog-wrapper`}>
        <div className={`bani-list overlay-ui ${overlayClassName}`}>
          {isLoadingBani ? (
            <div className="sttm-loader" />
          ) : (
            <>
              <header className="navigator-header">{title}</header>

              {isShowTranslitSwitch && (
                <Switch
                  controlId="translit-switch"
                  wrapperClassName="translit-switch"
                  onToggleSwitch={setTranslitState}
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

        {!isLoadingBani && (
          <div className={`bani-extras overlay-ui ${overlayClassName}`}>
            {extraBanis.map((extra, idx) => (
              <ExtraBani key={idx} {...extra} />
            ))}
          </div>
        )}
      </div>
    </DialogWrapper>
  );
};

SundarGutkaOverlayDialog.propTypes = {
  onDialogClose: PropTypes.func,
  isShowTranslitSwitch: PropTypes.bool,
};

export default SundarGutkaOverlayDialog;
