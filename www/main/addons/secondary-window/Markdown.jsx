import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ipcRenderer } from 'electron';

const Markdown = () => {
  const [markdown] = useState();

  useEffect(() => {
    ipcRenderer.on('window-name', (_, { title }) => {
      document.title = title;
    });
  }, []);
  return <ReactMarkdown>{markdown}</ReactMarkdown>;
};

export { Markdown };
