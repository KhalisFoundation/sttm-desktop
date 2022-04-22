import React, { createContext, useContext, useReducer } from 'react';
import PropTypes from 'prop-types';

export const DataLayerContext = createContext();

export const DataLayer = ({ reducer, initialState, children }) => (
  <DataLayerContext.Provider value={useReducer(reducer, initialState)}>
    {children}
  </DataLayerContext.Provider>
);

DataLayer.propTypes = {
  reducer: PropTypes.func,
  initialState: PropTypes.object,
  children: PropTypes.element,
};

export const useDataLayerValue = () => useContext(DataLayerContext);
