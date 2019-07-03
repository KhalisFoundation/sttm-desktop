import { INCREMENT_CHANGELOG_SEEN_COUNT, UPDATE_CHANGELOG_SEEN } from '../actions/changelog';
import { changelog as changelogDefaults } from '../defaults.json';

export default (state = changelogDefaults, { type, payload }) => {
  switch (type) {
    case INCREMENT_CHANGELOG_SEEN_COUNT:
      return {
        ...state,
        'changelog-seen-count': state['changelog-seen-count'] + 1,
      };
    case UPDATE_CHANGELOG_SEEN:
      return {
        ...state,
        'changelog-seen': payload.version,
      };
    default:
      return state;
  }
};
