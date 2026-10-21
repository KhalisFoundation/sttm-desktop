import React from 'react';
import VoiceFollow from './components/VoiceFollow';
import CollectorBoundary from './shadow/Boundary';

// Mounted once in the Launchpad. With no Autopilot tab it renders nothing and only runs the
// collector's hidden run; a render fault unmounts it (logged), never the controller.
const GuardedVoiceFollow = () => (
  <CollectorBoundary name="VoiceFollow">
    <VoiceFollow />
  </CollectorBoundary>
);

export default GuardedVoiceFollow;
