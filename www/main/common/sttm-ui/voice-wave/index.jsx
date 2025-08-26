import React from 'react';

export const VoiceWave = () => (
  <div className="voice-wave">
    {[...Array(8)].map((_, index) => (
      <div
        key={index}
        className="voice-bar"
        style={{
          animationDelay: `${index * 0.1}s`,
          animationDuration: '0.8s',
        }}
      />
    ))}
  </div>
);
