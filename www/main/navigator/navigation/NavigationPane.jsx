import React from 'react';
import Pane from '../utils/Pane';
import NavigationContent from './NavigationContent';
import NavigationHeader from './NavigationHeader';

function NavigationPane() {
  return (
    <div className="navigation-pane">
      <Pane Header={NavigationHeader} Content={NavigationContent} />
    </div>
  );
}

export default NavigationPane;
