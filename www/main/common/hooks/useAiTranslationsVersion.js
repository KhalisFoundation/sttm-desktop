import { useEffect, useState } from 'react';

const aiTranslationDB = require('../../banidb/pss-db');

// Changes whenever a new AI translations database has been downloaded, so a
// view can rebuild the verse on screen (e.g. from the BaniDB fallback to the
// AI translation) without waiting for the next verse.
export const useAiTranslationsVersion = () => {
  const [version, setVersion] = useState(aiTranslationDB.getVersion());
  useEffect(() => aiTranslationDB.onUpdate(setVersion), []);
  return version;
};
