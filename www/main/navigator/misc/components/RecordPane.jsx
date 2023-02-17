import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { ipcRenderer } from 'electron/renderer';
import anvaad from 'anvaad-js';

import { generateSRT } from 'subtitle-generator';

const path = require('path');
const remote = require('@electron/remote');
const { i18n } = remote.require('./app');
const fs = require('fs');

export const RecordPane = ({ className }) => {
  const { isSubtitleRecording, subtitleData } = useStoreState((state) => state.navigator);
  const { setIsSubtitleRecording } = useStoreActions((state) => state.navigator);
  const [fileList, setFileList] = useState([]);

  const userData = remote.app.getPath('userData');
  const directory = path.resolve(userData, 'subtitles');

  const startRecording = () => {
    if (!isSubtitleRecording) {
      setIsSubtitleRecording(true);
    }
  };

  const stopRecording = () => {
    const parsed = subtitleData.map((data, index) => {
      return {
        id: index,
        seconds: data.seconds,
        content: anvaad.unicode(data.content),
      };
    });
    const srt = generateSRT(parsed, 'seconds');
    if (isSubtitleRecording) {
      setIsSubtitleRecording(false);
    }
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory);
    }
    const currentDate = new Date();
    const filename = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}-${currentDate.getHours()}${currentDate.getMinutes()}${currentDate.getSeconds()}.srt`;
    const filePath = path.resolve(directory, filename);

    fs.writeFile(filePath, srt, updateList);
  };

  const updateList = () => {
    fs.readdir(directory, (error, files) => {
      const sortedFiles = files
        .map((fileName) => ({
          name: fileName,
          time: fs.statSync(`${directory}/${fileName}`).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time)
        .map((file) => file.name);
      setFileList(sortedFiles);
    });
  };

  useEffect(() => {
    updateList();
  });

  const download = (fileName) => {
    const filePath = path.resolve(directory, fileName);
    ipcRenderer.send('download-subtitle', filePath);
  };

  const deleteFile = (filename) => {
    const filePath = path.resolve(directory, filename);
    fs.unlink(filePath, (err) => {
      if (err) throw err;
    });
    updateList();
  };

  return (
    <div className={`subtitle-pane ${className}`}>
      <h3>Record Subtitles</h3>
      <p>To generate subtitles as you go through the shabads, click on the record button below:</p>
      {isSubtitleRecording ? (
        <button className="button subtitle-btn" onClick={stopRecording}>
          Stop Recording
        </button>
      ) : (
        <button className="button subtitle-btn" onClick={startRecording}>
          Record
        </button>
      )}
      {fileList.length > 0 && <h3>Previous recordings</h3>}
      {fileList.map((file) => {
        return (
          <div class="subtitle-item">
            <p>{file}</p>
            <div class="controls">
              <button
                className="button"
                onClick={() => {
                  download(file);
                }}
              >
                <i class="fa fa-download"></i>
              </button>
              <button
                className="button"
                onClick={() => {
                  deleteFile(file);
                }}
              >
                <i class="fa fa-trash"></i>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

RecordPane.propTypes = {
  className: PropTypes.string,
};
