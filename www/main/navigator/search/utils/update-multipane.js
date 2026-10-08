import { useStoreActions, useStoreState } from 'easy-peasy';
import { i18n } from '../../../common/i18n';

const updateMultipane = () => {
  const { pane1, pane2, pane3, activePaneId } = useStoreState((state) => state.navigator);
  const { setPane1, setPane2, setPane3, setActivePaneId } = useStoreActions(
    (actions) => actions.navigator,
  );
  const { defaultPaneId } = useStoreState((state) => state.userSettings);

  const paneMap = {
    1: { setPane: setPane1, pane: pane1 },
    2: { setPane: setPane2, pane: pane2 },
    3: { setPane: setPane3, pane: pane3 },
  };

  return (baniType, shabadId, verseId, multiPaneId = null) => {
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
        content: i18n.t('MULTI_PANE.SHABAD'),
        activeShabad: shabadId,
        baniType,
        versesRead: [verseId],
        activeVerse: verseId,
      };
    } else {
      newAttributes = {
        content: i18n.t('MULTI_PANE.SHABAD'),
        activeShabad: shabadId,
        baniType,
        // A new shabad/bani/ceremony arriving with no target verse (e.g. a fresh
        // bani pick from the controller sends only the id): clear the previous
        // item's active verse so it opens at the start instead of carrying over
        // a stale highlight from the last bani. Same item + no verse leaves it.
        ...(pane.activeShabad !== shabadId ? { activeVerse: null, versesRead: [] } : {}),
      };
    }
    if (pane !== newAttributes) {
      setPane(newAttributes);
    }
    // The pane a shabad, bani, or ceremony was just opened in is the live pane.
    // Display 2 follows activePaneId, and opening content never set it, so the
    // projected list stayed on the previous pane.
    if (multiPaneId && shabadPane !== activePaneId) {
      setActivePaneId(shabadPane);
    }
  };
};

export default updateMultipane;
