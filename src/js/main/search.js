/* eslint-disable import/no-named-as-default, import/no-named-as-default-member */
// Services
import banidbMod from '../shared/banidb';

// Global variables
let banidb;

const initBDB = async () => {
  if (!banidb) {
    banidb = await banidbMod();
  }
};

export default async (searchType, query, opts) => {
  await initBDB();

  const results = await banidb[searchType](query, opts);
  console.log(results.length);
};
