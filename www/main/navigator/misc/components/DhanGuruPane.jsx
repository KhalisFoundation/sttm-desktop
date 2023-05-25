import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
import insertSlide from '../../../common/constants/slidedb';
import { classNames } from '../../../common/utils';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

// const analytics = remote.getGlobal('analytics');
const { gurus } = insertSlide.dropdownStrings;

export const DhanGuruPane = ({ className }) => {
  const { shortcutTray } = useStoreState((state) => state.userSettings);

  return (
    <div className={classNames('dhan-guru-pane', className, shortcutTray && 'misc-pane-shrinked')}>
      {gurus.map((guru, index) => (
        <div className="dhan-guru-button" key={guru}>
          <span className="dhan-guru-button-prefix">{index}</span>
          <span className="dhan-guru-button-text">{i18n.t(`INSERT.DHAN_GURU.${guru}`)}</span>
        </div>
      ))}
    </div>
  );
};

DhanGuruPane.propTypes = {
  className: PropTypes.string,
};
