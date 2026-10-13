import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

export const VoiceWave = ({
  stream,
  isRecording,
  handleMicClick,
  width = 200,
  height = 40,
  barColor = '#666',
  barWidth = 3,
  barGap = 2,
  // Voice search stops itself after 15 s; pass null to keep listening.
  autoStopSeconds = 15,
  showDuration = true,
  placeholder = 'Click mic to start recording',
  // Stretch the bars over the parent (width/height then only set the bar count and shape).
  fill = false,
  className = '',
}) => {
  const animationRef = useRef();
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const startTimeRef = useRef(null);
  const [bars, setBars] = useState([]);
  const [duration, setDuration] = useState('00:00');

  useEffect(() => {
    if (!stream || !isRecording) {
      setBars([]);
      setDuration('00:00');
      startTimeRef.current = null;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    startTimeRef.current = Date.now();

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArrayRef.current);

      const numBars = Math.floor(width / (barWidth + barGap));
      const newBars = [];

      for (let i = 0; i < numBars; i++) {
        const dataIndex = Math.floor((i / numBars) * dataArrayRef.current.length);
        const value = dataArrayRef.current[dataIndex];
        const normalizedValue = value / 255;
        newBars.push(normalizedValue);
      }

      setBars(newBars);

      if (startTimeRef.current) {
        const elapsed = Date.now() - startTimeRef.current;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        setDuration(
          `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
        );
        if (autoStopSeconds != null && seconds === autoStopSeconds && handleMicClick) {
          handleMicClick();
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    // eslint-disable-next-line consistent-return
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      audioContext.close();
    };
  }, [stream, isRecording, width, barWidth, barGap, autoStopSeconds]);

  const renderBars = () =>
    bars.map((value, index) => {
      const barHeight = Math.max(value * height * 0.8, 2);
      const x = index * (barWidth + barGap);
      const y = (height - barHeight) / 2;

      return (
        <rect
          key={index}
          x={x}
          y={y}
          width={barWidth}
          height={barHeight}
          fill={barColor}
          rx={barWidth / 2}
        />
      );
    });

  const size = fill ? undefined : { width, height };

  if (!isRecording || bars.length === 0) {
    return (
      <div className={`waveform__container ${className}`.trim()} style={size}>
        {placeholder && <span className="waveform__placeholder">{placeholder}</span>}
      </div>
    );
  }

  return (
    <div className={`waveform${fill ? ' waveform--fill' : ''} ${className}`.trim()} style={size}>
      {showDuration && <div className="waveform__duration">{duration}</div>}
      {fill ? (
        <svg
          className="waveform__svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {renderBars()}
        </svg>
      ) : (
        <svg className="waveform__svg" width={width - 50} height={height}>
          {renderBars()}
        </svg>
      )}
    </div>
  );
};

VoiceWave.propTypes = {
  stream: PropTypes.instanceOf(MediaStream),
  isRecording: PropTypes.bool.isRequired,
  handleMicClick: PropTypes.func,
  width: PropTypes.number,
  height: PropTypes.number,
  barColor: PropTypes.string,
  barWidth: PropTypes.number,
  barGap: PropTypes.number,
  autoStopSeconds: PropTypes.number,
  showDuration: PropTypes.bool,
  placeholder: PropTypes.string,
  fill: PropTypes.bool,
  className: PropTypes.string,
};
