import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ipcRenderer } from 'electron';
import marked from 'marked';
import fs from 'fs';
import path from 'path';

const MarkdownFiles = {
  help: '../../../../HELP.md',
  legend: '../../../../LEGEND.md',
  changelog: '../../../../CHANGELOG.md',
};

const readMarkdown = name => {
  try {
    return marked(fs.readFileSync(path.resolve(__dirname, MarkdownFiles[name]), 'utf8'));
  } catch (e) {
    return '# Error';
  }
};
function Markdown() {
  const [markdown, setMarkdown] = useState('# Loading...');
  useEffect(() => {
    ipcRenderer.on('window-name', (_, { title, name }) => {
      document.title = title;
      document.querySelector('.markdown-frame').classList.toggle(name);

      setMarkdown(readMarkdown(name));
    });
  }, []);
  return <ReactMarkdown allowDangerousHtml>{markdown}</ReactMarkdown>;
}

export { Markdown };
