const INCREMENT_CHANGELOG_SEEN_COUNT = 'INCREMENT_CHANGELOG_SEEN_COUNT';
const incrementChangelogSeenCountAction = () => ({
  type: INCREMENT_CHANGELOG_SEEN_COUNT,
});

const UPDATE_CHANGELOG_SEEN = 'UPDATE_CHANGELOG_SEEN';
const updateChangelogSeenAction = version => ({
  type: UPDATE_CHANGELOG_SEEN,
  payload: {
    version,
  },
});

module.exports = {
  INCREMENT_CHANGELOG_SEEN_COUNT,
  incrementChangelogSeenCountAction,
  UPDATE_CHANGELOG_SEEN,
  updateChangelogSeenAction,
};
