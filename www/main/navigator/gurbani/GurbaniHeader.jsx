import React from 'react';

function GurbaniHeader() {
  const navigateVerseLeft = () => {
    console.log('left');
  };
  const navigateVerseRight = () => {
    console.log('right');
  };

  return (
    <>
      <i className="fa fa-arrow-circle-o-left" onClick={navigateVerseLeft}></i>
      <i className="fa fa-arrow-circle-o-right" onClick={navigateVerseRight}></i>
    </>
  );
}

export default GurbaniHeader;
