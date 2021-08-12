import banidb from '../../banidb';

export const loadAng = angNo => {
  return banidb.loadAng(angNo).then(verses => verses);
};
