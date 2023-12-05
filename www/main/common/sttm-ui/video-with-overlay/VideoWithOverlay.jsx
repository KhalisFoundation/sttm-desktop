import React from 'react';

const VideoWithOverlay = ({ src, overlayContent }) => {
  return (
    <div className="video-thumbnail-settings">
      <video src={src} width="100%" autoPlay muted loop />
      <div className="overlay">
        {overlayContent}
      </div>
    </div>
  );
};

export default VideoWithOverlay;