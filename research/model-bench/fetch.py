#!/usr/bin/env python3
"""fetch.py - download everything the benchmark needs, pinned, into data/ (about 1.6 GB).

  data/clips/<id>/{audio.wav, shabads.csv, lines.csv}  from khalisfoundation/GurbaniAutopilotBench at sample.json's revision
  data/models/<name>/...                              the published ONNX models + tokenizers (sha256-checked)
  data/models/jaspal-v2/frontend-from-v1.onnx         v1's front-end, cut out by make_v2_frontend.py
  data/scoring/{corpus.json, bani-members.json}        from khalisfoundation/sttm-model-bench at SCORING_REVISION

Needs a Hugging Face token that can read the khalisfoundation org (HF_TOKEN or `huggingface-cli login`).
"""
import hashlib, json, os, shutil, subprocess, sys

from huggingface_hub import hf_hub_download

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from infer import MODELS, SHA256, TOKENIZER_REPO, sha256  # noqa: E402

SCORING_REPO = 'khalisfoundation/sttm-model-bench'
SCORING_REVISION = 'a78212fc40dbd9a112b12d43195f797af8a67a05'
SCORING_FILES = {'corpus-97f67774fcf00cdd.json': ('corpus.json', 'f21365bb8d2b7c834e2f3be3924daf3b3e023688f2c11fa619635f5637243b0a'),
                 'bani-members.json': ('bani-members.json', '071ad8360a6b8d9f38c4c2672dc5d700362fc589dbe2358ec3cc7139a6ea13d5')}
FRONTEND_SHA256 = SHA256['jaspal-v2/frontend-from-v1.onnx']


def put(repo, fname, dest, kind='dataset', revision=None, want=None):
    if not os.path.exists(dest):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copyfile(hf_hub_download(repo, fname, repo_type=kind, revision=revision), dest)
    if want and sha256(dest) != want:
        sys.exit(f'{dest}: sha256 mismatch')


def main(data=os.path.join(HERE, 'data')):
    sample = json.load(open(os.path.join(HERE, 'sample.json')))
    for c in sample['clips']:
        for f in ['audio.wav'] + c['truthFiles']:
            put(sample['gab_repo'], f"{c['gab']}/{f}", os.path.join(data, 'clips', c['id'], f), revision=sample['gab_revision'])
    print(f"clips: {len(sample['clips'])}")
    for name, (repo, onnx_file, tok, _, _) in MODELS.items():
        d = os.path.join(data, 'models', name)
        put(repo, onnx_file, os.path.join(d, onnx_file), kind='model', want=SHA256.get(f'{name}/{onnx_file}'))
        put(TOKENIZER_REPO.get(name, repo), tok, os.path.join(d, tok), kind='model', want=SHA256.get(f'{name}/{tok}'))
    fe = os.path.join(data, 'models', 'jaspal-v2', 'frontend-from-v1.onnx')
    if not os.path.exists(fe):
        v1 = os.path.join(data, 'models', 'jaspal-v1', MODELS['jaspal-v1'][1])
        subprocess.run([sys.executable, os.path.join(HERE, 'make_v2_frontend.py'), v1, fe], check=True)
    if sha256(fe) != FRONTEND_SHA256:
        sys.exit(f'{fe}: sha256 differs from the published run (onnx version? see requirements.txt)')
    print(f'models: {", ".join(MODELS)}')
    for f, (dest, want) in SCORING_FILES.items():
        put(SCORING_REPO, f, os.path.join(data, 'scoring', dest), revision=SCORING_REVISION, want=want)
    print('scoring inputs: ok')


if __name__ == '__main__':
    main(*sys.argv[1:])
