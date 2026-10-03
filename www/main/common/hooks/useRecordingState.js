import { useEffect, useState } from 'react';
import { ipcRenderer } from 'electron';

// Tracks whether recording is currently active (broadcast from main process)
export const useRecordingState = () => {
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const handleToggle = (_event, payload) => setIsRecording(payload.isRecording);
    const handleState = (_event, state) => setIsRecording(state);

    ipcRenderer.on('recording-toggle', handleToggle);
    ipcRenderer.on('recording-state', handleState);

    return () => {
      ipcRenderer.removeListener('recording-toggle', handleToggle);
      ipcRenderer.removeListener('recording-state', handleState);
    };
  }, []);

  return isRecording;
};
