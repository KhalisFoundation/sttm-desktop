import { useStoreActions, useStoreState } from 'easy-peasy';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const updateMultipane = () => {
  const { pane1, pane2, pane3 } = useStoreState((state) => state.navigator);
  const { setPane1, setPane2, setPane3 } = useStoreActions((actions) => actions.navigator);
  const { defaultPaneId, currentWorkspace } = useStoreState((state) => state.userSettings);

  const paneMap = {
    1: { setPane: setPane1, pane: pane1 },
    2: { setPane: setPane2, pane: pane2 },
    3: { setPane: setPane3, pane: pane3 },
  };

  return (baniType, shabadId, verseId, multiPaneId = null) => {
    if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
      let shabadPane;
      if (!multiPaneId) {
        const existingPane =
          [pane1, pane2, pane3].findIndex((pane) => pane.activeShabad === shabadId) + 1;
        if (existingPane > 0) {
          shabadPane = existingPane;
        } else {
          shabadPane = defaultPaneId;
        }
      } else {
        shabadPane = multiPaneId;
      }
      const { pane, setPane } = paneMap[shabadPane];
      let newAttributes;

      if (verseId) {
        newAttributes = {
          ...pane,
          content: i18n.t('MULTI_PANE.SHABAD'),
          activeShabad: shabadId,
          baniType,
          versesRead: [verseId],
          activeVerse: verseId,
        };
      } else {
        newAttributes = {
          ...pane,
          content: i18n.t('MULTI_PANE.SHABAD'),
          activeShabad: shabadId,
          baniType,
        };
      }
      if (pane !== newAttributes) {
        setPane(newAttributes);
      }
    }
  };
};

export default updateMultipane;
