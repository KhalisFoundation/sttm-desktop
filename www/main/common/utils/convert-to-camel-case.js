const camelCase = require('lodash.camelcase');

const convertToCamelCase = (str, isPascalCase = false) => {
  const camelCaseStr = camelCase(str);
  const finalString = isPascalCase
    ? camelCaseStr.charAt(0).toUpperCase() + camelCaseStr.slice(1)
    : camelCaseStr;
  return finalString;
};

export default convertToCamelCase;
