import React from 'react';
import Pane from '../utils/Pane';
import GurbaniContent from './GurbaniContent';
import GurbaniHeader from './GurbaniHeader';

function GurbaniPane() {
  return (
    <div className="gurbani-pane">
      <Pane Header={GurbaniHeader} Content={GurbaniContent} />
    </div>
  );
}

export default GurbaniPane;
