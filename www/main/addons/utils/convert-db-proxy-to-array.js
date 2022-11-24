const convertDbProxyToArray = (dbProxyObj) => {
  const banisObject = { ...dbProxyObj };
  const banisArr = Object.keys(banisObject).map((idx) => {
    const { ID, Gurmukhi, Token } = banisObject[idx];
    return {
      id: ID,
      name: Gurmukhi,
      token: Token,
    };
  });

  return banisArr;
};

export default convertDbProxyToArray;
