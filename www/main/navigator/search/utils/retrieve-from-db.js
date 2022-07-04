import { remote } from 'electron';
import { getFilterOption } from '../../../banidb/realm-search';

const { i18n } = remote.require('./app');

export const retrieveFilterOption = async (optionsObj, type) => {
  const optionIds = [];
  let optionArr = [];

  optionArr = Object.values(optionsObj).map(option => {
    const dbId = i18n.t(`SEARCH.${type.toUpperCase()}S.${option}.DB_ID`);
    if (dbId) {
      optionIds.push(dbId);
      return dbId;
    }
    return i18n.t(`SEARCH.${type.toUpperCase()}S.${option}.VALUE`);
  });
  const data = await getFilterOption(type, optionIds);
  const optionObject = Object.assign({}, data);
  const retrievedObj = {};
  Object.keys(optionObject).forEach(idx => {
    if (type === 'source') {
      const { SourceEnglish, SourceID } = optionObject[idx];
      retrievedObj[SourceID] = SourceEnglish;
    } else if (type === 'raag') {
      const { RaagEnglish, RaagID } = optionObject[idx];
      retrievedObj[RaagID] = RaagEnglish;
    } else if (type === 'writer') {
      const { WriterEnglish, WriterID } = optionObject[idx];
      retrievedObj[WriterID] = WriterEnglish;
    }
  });
  optionArr = optionArr.map(option => {
    if (option in retrievedObj) {
      return retrievedObj[option];
    }
    return option;
  });
  return optionArr;
};
