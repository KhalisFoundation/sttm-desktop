import React, { useState } from 'react';
import PropTypes from 'prop-types';

import { Switch } from '../../../../sttm-ui';
import { ExtraBani } from './ExtraBani';
import { DialogWrapper } from '../DialogWrapper';
import { convertToHyphenCase } from '../../../../utils';

export const SundarGutkaOverlayDialog = ({
  title = 'Sunder Gutka',
  isShowTranslitSwitch = false,
  banis = [{ name: 'Sundar Gutka' }],
  extraBanis = [{ title: 'Nitnem Banis', banis: [{ name: 'Nitnem Banis' }] }],
  onDialogClose,
}) => {
  const [isTranslit, setTranslitState] = useState(false);
  const hyphenedTitle = convertToHyphenCase(title.toLowerCase());
  const overlayClassName = `ui-${hyphenedTitle}`;
  const blockListId = `${hyphenedTitle}-banis`;
  const blockListItemClassName = `${hyphenedTitle}-bani`;

  return (
    <DialogWrapper onDialogClose={onDialogClose}>
      <div className="sundar-gutka-dialog">
        <div className={`bani-list overlay-ui ${overlayClassName}`}>
          <header className="navigator-header">{title}</header>
          {isShowTranslitSwitch && <Switch onToggleSwitch={setTranslitState} />}
          <section className="blocklist">
            <ul id={blockListId} className="gurmukhi">
              {banis.map(b => (
                <li key={b.name} className={blockListItemClassName}>
                  {b.name}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div className={`bani-extras overlay-ui ${overlayClassName}`}>
          {extraBanis.map((extra, idx) => (
            <ExtraBani key={idx} {...extra} />
          ))}
        </div>
      </div>
    </DialogWrapper>
  );
};

SundarGutkaOverlayDialog.propTypes = {
  title: PropTypes.string,
  isShowTranslitSwitch: PropTypes.bool,
};
