const convertToCamelCase = (str, isPascalCase = false) => {
  const camelCase = str.split('-').reduce((a, b) => a + b.charAt(0).toUpperCase() + b.slice(1));
  const finalString = isPascalCase
    ? camelCase.charAt(0).toUpperCase() + camelCase.slice(1)
    : camelCase;
  return finalString;
};

export default convertToCamelCase;
