import React from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

/**
 * The Akhand Paatth analogue of Padding Tools.
 *
 * Padding Tools insets a fixed slide from four edges, which means little in a
 * continuously scrolling document: top and bottom only pad the two extreme ends
 * of a Shabad that never stops, and a fixed pixel inset would break the deck's
 * scaled-replica property (see `_verse-slide.scss`). The equivalent here is the
 * spacing around and inside a verse, offered through the same collapsible header
 * and minus / value / plus controls.
 *
 * There are two axes, not one. "Between Verses" sets the gap to the next verse;
 * "Between Lines" separates the Gurbani from its translation, transliteration
 * and teeka. Kept apart, a reader can bind a verse's own lines together and
 * still space the verses out; a single value can only trade one against the
 * other.
 *
 * The body carries the `paddingtool-spacing` variant, not Padding Tools'
 * `paddingtool-gurbani`: that layout spreads four edge controls over a
 * full-height panel and would strand two controls at its extreme ends.
 *
 * `paddingToolsOpen` is shared with Padding Tools because `ShabadDeck` renders
 * one of the two, so the flag means "the second tool panel is open" and the
 * preference carries across a mode switch.
 *
 * Values are in reference-design pixels, on the same 0-48 scale and steps of 4
 * as Padding Tools. `_verse-slide.scss` converts them to viewport units.
 */
const SPACING_MIN = 0;
const SPACING_MAX = 48;
const SPACING_STEP = 4;

const SPACING_AXES = [
  {
    titleKey: 'SPACING_TOOLS.BETWEEN_VERSES',
    stateName: 'verseSpacing',
    actionName: 'setVerseSpacing',
  },
  {
    titleKey: 'SPACING_TOOLS.BETWEEN_LINES',
    stateName: 'lineSpacing',
    actionName: 'setLineSpacing',
  },
];

const SpacingTools = () => {
  const viewerSettings = useStoreState((state) => state.viewerSettings);
  const { setPaddingToolsOpen } = useStoreActions((state) => state.viewerSettings);
  const { paddingToolsOpen } = viewerSettings;

  const sendSpacing = (actionName, value) => {
    global.platform.ipc.send(
      'update-global-setting',
      JSON.stringify({
        actionName,
        payload: value,
        settingType: 'viewerSettings',
      }),
    );
  };

  const createSpacingIcon = (axis, name) => {
    const value = viewerSettings[axis.stateName];
    const isMinusIcon = name === 'minus';
    const isIconDisabled = isMinusIcon ? value <= SPACING_MIN : value >= SPACING_MAX;
    const nextValue = isMinusIcon ? value - SPACING_STEP : value + SPACING_STEP;

    return (
      <i
        className={`${isMinusIcon ? 'fa fa-minus-circle' : 'fa fa-plus-circle'} ${isIconDisabled ? 'disabled' : ''}`}
        onClick={() => {
          if (!isIconDisabled) {
            sendSpacing(axis.actionName, nextValue);
          }
        }}
      />
    );
  };

  return (
    <div className="slide-paddingtools">
      <div className="quicktool-header" onClick={() => setPaddingToolsOpen(!paddingToolsOpen)}>
        {i18n.t('SPACING_TOOLS.SELF')}
        <i className={`fa fa-caret-${paddingToolsOpen ? 'up' : 'down'}`}></i>
      </div>
      {paddingToolsOpen && (
        <div className="paddingtool-body paddingtool-spacing">
          {SPACING_AXES.map((axis) => (
            <div className="paddingtool" key={axis.stateName}>
              <h4 className="paddingtool-title">{i18n.t(axis.titleKey)}</h4>
              <div className="paddingtool-icons">
                {createSpacingIcon(axis, 'minus')}
                <p className="paddingtool-icon-value">{viewerSettings[axis.stateName]}</p>
                {createSpacingIcon(axis, 'plus')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SpacingTools;
