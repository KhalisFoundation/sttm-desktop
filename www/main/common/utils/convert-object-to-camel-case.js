import convertToCamelCase from './convert-to-camel-case';

const convertObjToCamelCase = (obj) => {
  const ccObj = {};
  Object.keys(obj).forEach((key) => {
    ccObj[convertToCamelCase(key)] = obj[key];
  });
  return ccObj;
};

export default convertObjToCamelCase;
