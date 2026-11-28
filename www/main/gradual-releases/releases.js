// Changes released to users by location. Each release runs once per install:
// when the user is in one of the countries /config/desktop lists for its `id`.
// Until then it's checked again on every launch, so adding a country to the
// list releases it there without an app update.
//
// `run` gets the global store and returns whether it changed anything. To run a
// release again (e.g. with a different value), add it under a new id.

const OLD_ENGLISH_SOURCE = 'bdb';
const NEW_ENGLISH_SOURCE = 'pss_simple';

export const releases = [
  {
    // Users still on the default English translation are moved to Prof Sahib
    // Singh (Short). Anyone who picked another source keeps it, and anyone who
    // moves back afterwards isn't moved again, since the release has run.
    id: 'eng-translation-default-v1',
    run: (globalState) => {
      const { translationEnglishSource } = globalState.getState().userSettings;
      if (translationEnglishSource !== OLD_ENGLISH_SOURCE) {
        return false;
      }
      globalState.getActions().userSettings.setTranslationEnglishSource(NEW_ENGLISH_SOURCE);
      return true;
    },
  },
];
