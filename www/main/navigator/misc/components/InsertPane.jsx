import React, { useRef, useState } from 'react';
import { remote } from 'electron';
import insertSlide from '../../../common/constants/slidedb';

function InsertPane() {
  const { i18n } = remote.require('./app');
  const [isgurmukhi, setIsGurmukhi] = useState(false);
  const inputRef = useRef(null);
  const gurus = insertSlide.dropdownStrings;

  const addAnnouncement = () => {
    console.log(inputRef.current.value);
  };

  const HandleChange = () => {
    setIsGurmukhi(!isgurmukhi);
  };

  return (
    <ul className="list-of-items">
      <li>
        <a>
          <i className="fa fa-eye-slash list-icon" />
          {i18n.t('INSERT.ADD_EMPTY_SLIDE')}
        </a>
      </li>
      <li>
        <a>
          <i className="fa fa-circle list-icon" />
          {i18n.t('INSERT.ADD_WAHEGURU_SLIDE')}
        </a>
      </li>
      <li>
        <a>
          <i className="fa fa-circle-o list-icon" />
          <label>{i18n.t('INSERT.ADD_DHAN_GURU')} </label>
          <select>
            <option value=" ">{i18n.t('INSERT.SELECT')}</option>
            {gurus.gurus.map((value, index) => (
              <option value={insertSlide.slideStrings.dhanguruStrings[index]} key={index}>
                {i18n.t(`INSERT.DHAN_GURU.${value}`)}
              </option>
            ))}
          </select>
        </a>
      </li>
      <li className="announcement-box">
        <header>
          <i className="fa fa-bullhorn list-icon" />
          {i18n.t('INSERT.ADD_ANNOUNCEMENT_SLIDE')}
        </header>
        <div className="announcement-switch">
          <span>{i18n.t('INSERT.ANNOUNCEMENT_IN_GURMUKHI')}</span>
          <div className="switch">
            <input
              id="announcement-language"
              name="announcement-language"
              type="checkbox"
              value="gurmukhi"
              onClick={HandleChange}
            />
            <label htmlFor="announcement-language" />
          </div>
        </div>
        <textarea
          className={`${isgurmukhi ? 'gurmukhi' : ''} announcement-text`}
          placeholder={
            !isgurmukhi
              ? i18n.t('INSERT.ADD_ANNOUNCEMENT_TEXT')
              : i18n.t('INSERT.ADD_ANNOUNCEMENT_TEXT_GURMUKHI')
          }
          ref={inputRef}
        />
        <button className="announcement-slide-btn" onClick={addAnnouncement}>
          {i18n.t('INSERT.ADD_ANNOUNCEMENT')}
        </button>
      </li>
    </ul>
  );
}

export default InsertPane;
