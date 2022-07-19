const remote = require('@electron/remote');

import { getFilterOption } from '../../../banidb/realm-search';

const { i18n } = remote.require('./app');

export const retrieveFilterOption = async (optionsObj, type) => {
  const idArray = Object.keys(optionsObj).filter(
    option => option.toLowerCase() !== 'all' && option.toLowerCase() !== 'others',
  );
  const retrievedObj = await getFilterOption(type, idArray);
  const valueObj = Object.assign({}, retrievedObj);

  const finalArray = [
    {
      value: 'all',
      text: i18n.t(`SEARCH.${type.toUpperCase()}S.${optionsObj.all}.TEXT`),
    },
  ];

  Object.keys(valueObj).forEach(idx => {
    if (type === 'source') {
      const { SourceID } = valueObj[idx];
      finalArray.push({
        value: SourceID,
        text: i18n.t(`SEARCH.${type.toUpperCase()}S.${optionsObj[SourceID]}.TEXT`),
      });
    } else if (type === 'raag') {
      const { RaagEnglish, RaagID } = valueObj[idx];
      finalArray.push({
        value: RaagEnglish,
        text: i18n.t(`SEARCH.${type.toUpperCase()}S.${optionsObj[RaagID]}.TEXT`),
      });
    } else if (type === 'writer') {
      const { WriterEnglish, WriterID } = valueObj[idx];
      finalArray.push({
        value: WriterEnglish,
        text: i18n.t(`SEARCH.${type.toUpperCase()}S.${optionsObj[WriterID]}.TEXT`),
      });
    }
  });

  if (type !== 'source') {
    finalArray.push({
      value: 'others',
      text: i18n.t(`SEARCH.${type.toUpperCase()}S.${optionsObj.others}.TEXT`),
    });
  }
  return finalArray;
};
