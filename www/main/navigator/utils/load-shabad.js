import banidb from '../../banidb';

export const loadShabad = (shabadID, lineID, setActiveShabad) => {
  banidb.loadShabad(shabadID, lineID).then(rows => setActiveShabad([...rows]));
};
