import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { generateSRT } from 'subtitle-generator';

const remote = require('@electron/remote');
const { i18n } = remote.require('./app');

const analytics = remote.getGlobal('analytics');

export const RecordPane = ({ className }) => {

	const startRecording = () => {
		console.log('start recording');
	}

	const stopRecording = () => {
		console.log('stop recording');
	}

  return (
    <ul className={`list-of-items ${className}`}>
      <h1>Record subtitle</h1>
			<button onClick={startRecording}>Start Recording</button>
			<button onClick={stopRecording}>Stop Recording</button>
    </ul>
  );
};

RecordPane.propTypes = {
  className: PropTypes.string,
};
