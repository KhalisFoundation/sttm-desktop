import React from 'react';
import SearchPane from './search/components/SearchPane';
import ShabadPane from './shabad/ShabadPane';
import MiscPane from './misc/components/MiscPane';
import ViewerPane from './viewer/ViewerPane';

const Navigator = () => {
  return (
    <>
      <div className="navigator-row">
        <SearchPane />
        <ShabadPane />
      </div>
      <div className="navigator-row">
        <ViewerPane />
        <MiscPane />
      </div>
    </>
  );
};

export default Navigator;
