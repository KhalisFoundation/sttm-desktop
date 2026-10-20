import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
import ViewerIcon from '../icons/ViewerIcon';

// Font sizes for the Small, Medium and Large options, in vh.
const FONT_SIZES = { small: 2, medium: 3, large: 4 };

// A bar under the slide with the logo and the shabad's source, Ang, writer and
// raag. It's only on screen while there are details to show (see
// useShabadInfo); otherwise the display looks as it always has.
export const ShabadInfo = ({ details, color }) => {
  const { shabadInfoFontSize } = useStoreState((state) => state.userSettings);
  const fontSize = FONT_SIZES[shabadInfoFontSize] || FONT_SIZES.small;

  return (
    <div className="shabad-info">
      <ViewerIcon className="shabad-info__logo" />
      <div className="shabad-info__text" style={{ color, fontSize: `${fontSize}vh` }}>
        {details.map((detail) => (
          <span key={detail} className="shabad-info__detail">
            {detail}
          </span>
        ))}
      </div>
    </div>
  );
};

ShabadInfo.propTypes = {
  details: PropTypes.arrayOf(PropTypes.string).isRequired,
  color: PropTypes.string,
};
