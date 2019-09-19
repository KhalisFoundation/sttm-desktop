import React from 'react';
import { useSelector } from 'react-redux';

export default () => {
  const { results, search } = useSelector(state => state);
  return <ul id="results" className="gurmukhi" />;
};
