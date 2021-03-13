import React, { useEffect, useState } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import VersePanel from '../../common/sttm-ui/versepanel/VersePanel';
function ShabadContent() {
  const verse = useStoreState(state => state.navigator.verseSelected);
  const [isHover, setHover] = useState(false);
  const onClick = () => {
    console.log('shabad clicked');
  };

  const onMouseOver = () => {
    setHover(true);
    console.log(isHover);
  };
  return (
    <>
      <VersePanel onClick={onClick} ShabadPane onMouseOver={onMouseOver} verse={verse} />
    </>
  );
}

export default ShabadContent;
