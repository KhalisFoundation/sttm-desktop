import React from 'react';
import { remote, shell } from 'electron';

const main = remote.require('./app');

const { i18n, store } = main;

class ZoomClosedCaptionPage extends React.Component {
  constructor(props) {
    super(props);
    this.state = { apiToken: store.get('userPrefs.app.zoomToken') };
    this.onChangeHandler = this.onChangeHandler.bind(this);
    this.buttonClick = this.buttonClick.bind(this);
  }

  openZoom(evt) {
    evt.preventDefault();
    shell.openExternal('https://zoom.us/profile/setting');
  }

  onChangeHandler(event) {
    this.setState({ apiToken: String(event.currentTarget.value) });
  }

  buttonClick() {
    const newVal = store.get('userPrefs.app.zoomToken') ? '' : this.state.apiToken;
    store.set('userPrefs.app.zoomToken', newVal);
    this.setState({ apiToken: newVal });
  }

  render() {
    return (
      <>
        <h1>{i18n.t('BANI_OVERLAY.ZOOM_CLOSED_CAPTIONS_PAGE.CONNECT_ZOOM_TITLE')}</h1>
        <div className="input-container">
          <div>
            <input type="text" value={this.state.apiToken} onChange={this.onChangeHandler} />
            <button onClick={this.buttonClick} disabled={this.state.apiToken.length === 0}>
              {store.get('userPrefs.app.zoomToken')
                ? i18n.t('BANI_OVERLAY.ZOOM_CLOSED_CAPTIONS_PAGE.CLEAR_BUTTON')
                : i18n.t('BANI_OVERLAY.ZOOM_CLOSED_CAPTIONS_PAGE.SAVE_BUTTON')}
            </button>
          </div>
          <div>{i18n.t('BANI_OVERLAY.ZOOM_CLOSED_CAPTIONS_PAGE.CONNECT_ZOOM_INPUT_HELPER')}</div>
        </div>
        <div className="instructions">
          <div>{i18n.t('BANI_OVERLAY.ZOOM_CLOSED_CAPTIONS_PAGE.INSTRUCTIONS_HEADING')}</div>
          <ol>
            <li>
              {i18n.t('BANI_OVERLAY.ZOOM_CLOSED_CAPTIONS_PAGE.INSTRUCTIONS_1_1')}
              <a href="#" onClick={this.openZoom}>
                https://zoom.us/profile/setting
              </a>
              {i18n.t('BANI_OVERLAY.ZOOM_CLOSED_CAPTIONS_PAGE.INSTRUCTIONS_1_2')}
              <strong>{i18n.t('BANI_OVERLAY.ZOOM_CLOSED_CAPTIONS_PAGE.INSTRUCTIONS_1_3')}</strong>
            </li>
            <li>{i18n.t('BANI_OVERLAY.ZOOM_CLOSED_CAPTIONS_PAGE.INSTRUCTIONS_2')}</li>
            <li>{i18n.t('BANI_OVERLAY.ZOOM_CLOSED_CAPTIONS_PAGE.INSTRUCTIONS_3')}</li>
            <li>{i18n.t('BANI_OVERLAY.ZOOM_CLOSED_CAPTIONS_PAGE.INSTRUCTIONS_4')}</li>
          </ol>
        </div>
        <img src="assets/img/help_images/ZoomCCInfo.png" />
      </>
    );
  }
}

export const Page = () => {
  return <ZoomClosedCaptionPage />;
};
