// Which speech model a benchmark runs: the model pack VF_SPEECH_MODEL points at (a folder with
// model.json {name, onnx, tokenizer, blank, ...}, see the app's engine/speech-model.js), or the
// built-in Karanbir model (MODEL env or the default path). Only the ONNX path and the name are read
// here; the app build under test loads the pack itself (same env var).
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_MODEL = path.join(os.homedir(), 'AAI/models/karansea-shabad-ctc/model.int8.onnx');

function speechModel() {
  const dir = process.env.VF_SPEECH_MODEL;
  if (!dir) return { name: 'karanbir', onnx: process.env.MODEL || DEFAULT_MODEL, pack: null };
  const root = path.resolve(dir.replace(/^~(?=\/)/, os.homedir()));
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'model.json'), 'utf8'));
  if (!cfg.onnx) throw new Error(`speech model pack ${root}: model.json has no onnx`);
  return { name: cfg.name || path.basename(root), onnx: path.resolve(root, cfg.onnx), pack: root };
}

module.exports = { speechModel, DEFAULT_MODEL };
