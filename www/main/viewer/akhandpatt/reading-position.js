// Module state survives a deck remount; the seed id prevents resuming a different selection.
let position = null;

export const rememberReadingPosition = (seedShabadId, shabadId, verseId) => {
  position = { seedShabadId, shabadId, verseId };
};

export const recallReadingPosition = (seedShabadId) => {
  if (!position || position.seedShabadId !== seedShabadId) {
    return null;
  }
  return { shabadId: position.shabadId, verseId: position.verseId };
};

export const forgetReadingPosition = () => {
  position = null;
};
