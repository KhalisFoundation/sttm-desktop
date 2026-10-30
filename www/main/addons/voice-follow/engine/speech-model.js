// Which speech model the engine runs. Unset (every user): Karanbir's built-in model, vocabulary and
// blank id 256, exactly as before. Benchmarks and developers set VF_SPEECH_MODEL to a model pack: a
// folder with the model's ONNX (same audio/audio_len -> log_probs/out_len graph), its vocabulary
// and pieces as JSON (written from the SentencePiece file by the benchmark tools), and a model.json
//   { "name": "jaspal-v3", "onnx": "model.int8.onnx", "vocab": "vocab.json", "pieces": "pieces.json", "blank": 0 }
// Nothing is downloaded for a pack; a missing file is an error at start, never a fallback.
const fs = require('fs');
const path = require('path');

function loadPack(dir) {
  const root = path.resolve(dir);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'model.json'), 'utf8'));
  const file = (f) => {
    if (!f || !fs.existsSync(path.resolve(root, f)))
      throw new Error(`speech model pack ${root}: missing ${f}`);
    return path.resolve(root, f);
  };
  if (!Number.isInteger(cfg.blank))
    throw new Error(`speech model pack ${root}: model.json needs an integer blank`);
  return {
    name: cfg.name || path.basename(root),
    onnx: file(cfg.onnx),
    blank: cfg.blank,
    vocab: JSON.parse(fs.readFileSync(file(cfg.vocab), 'utf8')), // id -> piece
    pieces: JSON.parse(fs.readFileSync(file(cfg.pieces), 'utf8')), // [{p, s}]
  };
}

const builtin = () => ({
  name: 'karanbir',
  onnx: null, // model-manager: the bundled copy or the per-user download
  blank: 256,
  // eslint-disable-next-line global-require
  vocab: require('./assets/vocab'),
  // eslint-disable-next-line global-require
  pieces: require('./assets/pieces'),
});

let current = null;
function active() {
  if (!current)
    current = process.env.VF_SPEECH_MODEL ? loadPack(process.env.VF_SPEECH_MODEL) : builtin();
  return current;
}

module.exports = { active, loadPack };
