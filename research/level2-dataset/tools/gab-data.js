// Where the GAB tools read and write their benchmark data (answer keys, test lists, results/):
// VF_GAB_DATA, else the folder above tools/ (research/level2-dataset in a full checkout). The tools
// themselves need nothing else from that folder.
const os = require('os');
const path = require('path');

const DS = process.env.VF_GAB_DATA
  ? path.resolve(process.env.VF_GAB_DATA.replace(/^~(?=\/|$)/, os.homedir()))
  : path.join(__dirname, '..');

module.exports = { DS };
