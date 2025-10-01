export const getMicError = (error) => {
  let errorMessage = 'Unable to access microphone. ';
  let errorLabel = 'microphone-error';
  if (error.name === 'NotAllowedError') {
    errorMessage +=
      'Microphone access was denied. Please check your system permissions and allow microphone access for this application.';
    errorLabel = 'permission-denied';
  } else if (error.name === 'NotFoundError') {
    errorMessage += 'No microphone found. Please connect a microphone and try again.';
    errorLabel = 'no-microphone';
  } else if (error.name === 'NotReadableError') {
    errorMessage +=
      'Microphone is being used by another application. Please close other applications using the microphone and try again.';
    errorLabel = 'microphone-in-use';
  } else if (error.name === 'OverconstrainedError') {
    errorMessage += 'Microphone constraints could not be satisfied. Please try again.';
    errorLabel = 'constraints-error';
  } else {
    errorMessage += 'Please check your microphone permissions and try again.';
  }
  return { errorMessage, errorLabel };
};
