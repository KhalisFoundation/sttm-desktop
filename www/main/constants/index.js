/* eslint-disable import/prefer-default-export */
import { version as appVersion } from '../../../package.json';

const useStageAPI = appVersion.includes('alpha') || process.env.NODE_ENV === 'development';
export const API_ENDPOINT = useStageAPI
  ? 'https://stgapi.sikhitothemax.org'
  : 'https://api.sikhitothemax.org';

export const DEFAULT_OVERLAY = 'none';
export const nitnemBaniIds = [2, 4, 6, 9, 10, 20, 21, 23];
export const popularBaniIds = [90, 30, 31, 22];
export const visibleCeremoniesIds = [1, 3, 5];
