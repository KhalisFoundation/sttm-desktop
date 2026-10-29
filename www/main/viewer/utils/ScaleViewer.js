export const updateViewerScale = () => {
  if (global.externalDisplay) {
    global.viewer = global.externalDisplay;
  } else {
    global.viewer = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }
  const $fitInsideWindow = document.body.classList.contains('presenter-view')
    ? document.querySelector('.viewer-content')
    : document.body;

  let previewStyles = '';
  previewStyles += `font-size: ${global.viewer.height / 100}px;`;

  const fitInsideWidth = $fitInsideWindow.offsetWidth;
  const fitInsideHeight = $fitInsideWindow.offsetHeight;
  const viewerRatio = global.viewer.width / global.viewer.height;

  // Try scaling by width first
  const proposedHeight = fitInsideWidth / viewerRatio;
  if (fitInsideHeight > proposedHeight) {
    previewStyles += `height: ${proposedHeight}px;`;
  } else {
    const proposedWidth = fitInsideHeight * viewerRatio;
    previewStyles += `width: ${proposedWidth}px;`;
  }
  previewStyles = document.createTextNode(`.scale-viewer #webview-viewer { ${previewStyles} }`);

  const $previewStyles = document.getElementById('preview-styles');
  if ($previewStyles) {
    $previewStyles.innerHTML = '';
    $previewStyles.appendChild(previewStyles);
  } else {
    const style = document.createElement('style');
    style.id = 'preview-styles';
    style.appendChild(previewStyles);
    document.head.appendChild(style);
  }
};
