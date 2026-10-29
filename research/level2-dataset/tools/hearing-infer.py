#!/usr/bin/env python3
"""hearing-infer.py - per-window transcripts for the "hearing score" diagnostic (see HEARING.md).

Every model hears the SAME windows: for each clip segment [s0, s1] of hearing-sample.json, windows [t-4, t] for
t = s0+4, s0+5, ... <= s1 (4 s window, 1 s hop), 16 kHz mono float32. Greedy decoding (CTC, or RNNT where the
author recommends it). Output: results/hearing/transcripts/<model>/<clip>.jsonl, one {"t": <window end, clip s>,
"text": ...} per window, plus meta.json (model file sha256, format, front-end, decoder).

Adapters (--model):
  karanbir-int8 / karanbir-fp32   ONNX as published (front-end in the graph): the model card's own script
  jaspal-int8                     Jaspal's sggs-asr-v0 dynamic-int8 ONNX (same interface; blank 0, bpe.model)
  surinder-ctc / surinder-rnnt    NeMo checkpoint (.nemo) from the author's HF repo, NeMo preprocessor
  sukhpal-ctc  / sukhpal-rnnt     same, for sukhpalsingh/baniguru_v1
  onnx:<path>                     any Karanbir-style ONNX (inputs audio, audio_len -> log_probs, out_len); needs --vocab
  nemo:<path.nemo>[:ctc|rnnt]     any AI4Bharat IndicConformer-style hybrid .nemo (multisoftmax; pa slice decoded)
  icefall:<dir>                   icefall Zipformer2 state dict (<dir>/model.pt + bpe.model), e.g. Jaspal's sggs-asr-v0;
                                  greedy CTC on the ctc_output head; runs in ~/AAI/nemo-venv (torch + lhotse)
The ONNX adapters run in a venv with onnxruntime + sentencepiece (~/AAI/voice-venv); the NeMo ones in a venv with
nemo_toolkit[asr] (~/AAI/nemo-venv). hearing.sh picks the venv.

NeMo checkpoints are read with torch.load(weights_only=True) (tensors only; no arbitrary pickle code), streamed
from the .nemo tar. The model is assembled from vanilla NeMo modules (preprocessor, ConformerEncoder, ConvASRDecoder,
RNNTDecoder, RNNTJoint) after dropping the AI4Bharat-fork-only keys (multisoftmax / multilingual / language_keys);
the fork's language masking is reproduced exactly by decoding over the language's 256 ids + blank only.
"""
import argparse, hashlib, io, json, os, sys, tarfile, time, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DS = os.path.dirname(HERE)
OUT = os.environ.get('HEARING_OUT') or os.path.join(DS, 'results', 'hearing', 'transcripts')  # HEARING_OUT: write elsewhere (side samples)
MODELS = os.path.expanduser('~/AAI/models')
WIN, HOP, SR = float(os.environ.get('HEARING_WIN', 4.0)), float(os.environ.get('HEARING_HOP', 1.0)), 16000  # env overrides for window sweeps

KNOWN = {
    'karanbir-int8': ('onnx', f'{MODELS}/karansea-shabad-ctc/model.int8.onnx'),
    'karanbir-fp32': ('onnx', f'{MODELS}/karansea-shabad-ctc/model.onnx'),
    'surinder-ctc': ('nemo', f'{MODELS}/surinder-kirtan/indicconformer-pa-v3-kirtan.nemo', 'ctc'),
    'surinder-rnnt': ('nemo', f'{MODELS}/surinder-kirtan/indicconformer-pa-v3-kirtan.nemo', 'rnnt'),
    'sukhpal-ctc': ('nemo', f'{MODELS}/sukhpal-baniguru-v1/baniguru_offline_v1.nemo', 'ctc'),
    'sukhpal-rnnt': ('nemo', f'{MODELS}/sukhpal-baniguru-v1/baniguru_offline_v1.nemo', 'rnnt'),
    # Jaspal's dynamic-int8 ONNX export of sggs-asr-v0 (fbank + per-utterance norm in the graph; blank 0; bpe.model vocab 1000)
    'jaspal-int8': ('onnx', f'{MODELS}/jaspal-sggs-v0-onnx/sggs-asr-v0.int8.onnx', f'{MODELS}/jaspal-sggs-v0/bpe.model', 0),
}
KARANBIR_SPM = f'{MODELS}/karansea-shabad-ctc/tokenizer.model'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def read_wav(path):
    with wave.open(path, 'rb') as w:
        assert w.getframerate() == SR and w.getnchannels() == 1 and w.getsampwidth() == 2, f'{path}: need 16 kHz mono s16'
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    return pcm.astype(np.float32) / 32768.0


def windows(clip):
    pcm = read_wav(clip['wav'])
    s0 = clip.get('start', 0.0)
    s1 = min(clip.get('end', len(pcm) / SR), len(pcm) / SR)
    t = s0 + WIN
    while t <= s1 + 1e-6:
        a, b = int(round((t - WIN) * SR)), int(round(t * SR))
        yield round(t, 3), pcm[a:b]
        t += HOP


# ---------------------------------------------------------------- ONNX (Karanbir-style) ----------
class OnnxCTC:
    """The model card's script: audio [1,T] float32 + audio_len -> log_probs; greedy CTC; sentencepiece decode."""

    def __init__(self, path, spm_path=KARANBIR_SPM, threads=4, blank=256):
        import onnxruntime as ort
        self.blank = blank
        import sentencepiece as spm
        o = ort.SessionOptions()
        o.intra_op_num_threads = threads
        o.inter_op_num_threads = 1
        self.sess = ort.InferenceSession(path, o, providers=['CPUExecutionProvider'])
        self.sp = spm.SentencePieceProcessor()
        self.sp.Load(spm_path)
        self.meta = {'format': f'ONNX {os.path.basename(path)} (as published)', 'front_end': 'in the ONNX graph (author export)',
                     'decoder': f'greedy CTC, blank {blank}, sentencepiece decode (model card script)', 'file': path}

    def batch(self, wavs):
        out = []
        for w in wavs:  # batch 1, exactly as the card (no padding effects on per-feature normalisation)
            lp, n = self.sess.run(['log_probs', 'out_len'], {'audio': w[None, :], 'audio_len': np.array([len(w)], dtype=np.int64)})
            ids = lp[0, :int(n[0])].argmax(-1).tolist()
            col, prev = [], -1
            for i in ids:
                if i != prev and i != self.blank:
                    col.append(int(i))
                prev = i
            out.append(self.sp.decode(col))
        return out


# ---------------------------------------------------------------- NeMo (AI4Bharat hybrid) ---------
class NemoHybrid:
    def __init__(self, path, decoder='ctc', lang='pa', threads=4):
        import torch
        from omegaconf import OmegaConf
        import sentencepiece as spm
        from nemo.collections.asr.modules import AudioToMelSpectrogramPreprocessor, ConformerEncoder, ConvASRDecoder, RNNTDecoder, RNNTJoint
        torch.set_num_threads(threads)
        self.torch = torch
        tf = tarfile.open(path, 'r')
        names = {os.path.basename(m.name): m for m in tf.getmembers()}
        cfg = OmegaConf.to_container(OmegaConf.load(io.StringIO(tf.extractfile(names['model_config.yaml']).read().decode())))
        keys = cfg['joint']['language_keys']
        k = keys.index(lang)
        per = len(cfg['aux_ctc']['decoder']['vocabulary']) // len(keys)  # 5632 / 22 = 256
        self.lo, self.hi, self.blank = k * per, (k + 1) * per, cfg['joint']['num_classes']
        self.sel = list(range(self.lo, self.hi)) + [self.blank]
        spm_member = cfg['tokenizer']['langs'][lang]['model_path'].replace('nemo:', '')
        self.sp = spm.SentencePieceProcessor()
        self.sp.LoadFromSerializedProto(tf.extractfile(names[spm_member]).read())
        assert self.sp.get_piece_size() == per, (self.sp.get_piece_size(), per)
        voc = cfg['aux_ctc']['decoder']['vocabulary'][self.lo:self.hi]
        assert voc[1] == self.sp.id_to_piece(1) and voc[-1] == self.sp.id_to_piece(per - 1), 'pa slice != pa tokenizer'

        def clean(d, drop=('multisoftmax', 'multilingual', 'language_keys', 'vocabulary', '_target_')):
            return {a: b for a, b in d.items() if a not in drop}
        pp = clean(cfg['preprocessor'])
        self.pre = AudioToMelSpectrogramPreprocessor(**pp)
        self.enc = ConformerEncoder(**clean(cfg['encoder']))
        self.ctc = ConvASRDecoder(feat_in=cfg['aux_ctc']['decoder']['feat_in'], num_classes=cfg['aux_ctc']['decoder']['num_classes'])
        dec = clean(cfg['decoder'])
        self.dec = RNNTDecoder(**dec)
        jn = clean(cfg['joint'])
        jn.pop('fuse_loss_wer', None); jn.pop('fused_batch_size', None)
        jn['num_classes'] = per  # the multilingual joint has one output head per language (joint_net.2.<lang>): load the pa head
        self.joint = RNNTJoint(**jn)
        sd = torch.load(tf.extractfile(names['model_weights.ckpt']), map_location='cpu', weights_only=True)
        parts = {'preprocessor.': self.pre, 'encoder.': self.enc, 'ctc_decoder.': self.ctc, 'decoder.': self.dec, 'joint.': self.joint}
        loaded = {}
        for pre, mod in parts.items():
            sub = {kk[len(pre):]: v for kk, v in sd.items() if kk.startswith(pre)}
            if pre == 'joint.':
                heads = {kk for kk in sub if kk.startswith('joint_net.2.')}
                sub = {kk: v for kk, v in sub.items() if kk not in heads}
                sub.update({f'joint_net.2.{w}': sd[f'joint.joint_net.2.{lang}.{w}'] for w in ('weight', 'bias')})
            missing, unexpected = mod.load_state_dict(sub, strict=False)
            missing = [m for m in missing if 'featurizer.window' not in m and 'featurizer.fb' not in m]
            assert not missing and not unexpected, (pre, missing[:5], unexpected[:5])
            loaded[pre] = len(sub)
        left = [kk for kk in sd if not any(kk.startswith(p) for p in parts)]
        assert not left, left[:5]
        for m in (self.pre, self.enc, self.ctc, self.dec, self.joint):
            m.eval()
        self.decoder = decoder
        self.meta = {'format': f'NeMo {os.path.basename(path)} (fp32 PyTorch, torch.load weights_only=True), nemo {cfg.get("nemo_version")} config',
                     'front_end': f'NeMo AudioToMelSpectrogramPreprocessor from the checkpoint config ({ {a: pp[a] for a in ("features", "n_fft", "window_size", "window_stride", "normalize")} }, defaults preemph 0.97, log add 2^-24, eval: no dither)',
                     'decoder': (f'greedy CTC over the {lang} slice [{self.lo},{self.hi}) + blank {self.blank} of the shared CTC head (= AI4Bharat multisoftmax language mask)' if decoder == 'ctc'
                                 else f'greedy RNNT (max 10 symbols/frame) with the joint\'s {lang} output head (256 + blank) and language-local prediction-net labels') + ', pa sentencepiece decode',
                     'file': path, 'loaded_tensors': loaded}

    def batch(self, wavs):
        torch = self.torch
        with torch.inference_mode():
            x = torch.from_numpy(np.stack(wavs))
            n = torch.full((len(wavs),), x.shape[1], dtype=torch.long)
            f, fl = self.pre(input_signal=x, length=n)
            e, el = self.enc(audio_signal=f, length=fl)
            if self.decoder == 'ctc':
                lp = self.ctc(encoder_output=e)  # [B, T, V+1] log-softmax over all; argmax over the slice = masked argmax
                sel = lp[:, :, self.sel]
                out = []
                for b in range(len(wavs)):
                    ids = sel[b, :int(el[b])].argmax(-1).tolist()
                    col, prev = [], -1
                    for i in ids:
                        if i != prev and i != len(self.sel) - 1:
                            col.append(int(i))
                        prev = i
                    out.append(self.sp.decode(col))
                return out
            return [self._rnnt(e[b:b + 1, :, :int(el[b])]) for b in range(len(wavs))]

    def _rnnt(self, enc):
        """Greedy RNNT (NeMo GreedyRNNTInfer logic, max_symbols 10) with the joint restricted to the language slice."""
        torch = self.torch
        f = self.joint.project_encoder(enc.transpose(1, 2))  # [1, T, H]
        blank_sel = len(self.sel) - 1
        hyp = []
        g, state = self.dec.predict(None, state=None, add_sos=False, batch_size=1)  # SOS (NeMo: label == SOS -> None)
        p = self.joint.project_prednet(g)
        for t in range(f.shape[1]):
            for _ in range(10):
                logits = self.joint.joint_after_projection(f[:, t:t + 1], p)[0, 0, 0]  # [256 pa + blank] (pa head)
                k = int(logits.argmax())
                if k == blank_sel:
                    break
                hyp.append(k)
                g, state = self.dec.predict(torch.tensor([[k]], dtype=torch.long), state=state, add_sos=False, batch_size=1)  # fork: prediction net takes language-LOCAL ids (global ids give degenerate repeats; checked)
                p = self.joint.project_prednet(g)
        return self.sp.decode(hyp)


# ---------------------------------------------------------------- icefall Zipformer (Jaspal sggs-asr-v0) -----
class IcefallZipformerCTC:
    """icefall Zipformer2 state dict (model.pt) + SentencePiece bpe.model; greedy CTC on the auxiliary ctc_output head.
    The network is rebuilt from icefall's zipformer recipe (egs/librispeech/ASR/zipformer at the author's commit, files
    in ~/AAI/icefall-zipformer) with the architecture read off the state-dict shapes; k2 is stubbed (only the Swoosh
    activations' forward is needed at inference). Front-end: 80-dim Lhotse fbank (kaldi-compatible, 25/10 ms) with
    per-utterance per-dim mean/std normalisation (the model card's recipe)."""

    def __init__(self, d, threads=4, norm='dim'):
        import re, torch, sentencepiece as spm
        sys.path.insert(0, os.path.expanduser('~/AAI/icefall-zipformer'))
        from zipformer import Zipformer2
        from subsampling import Conv2dSubsampling
        from lhotse import Fbank, FbankConfig
        torch.set_num_threads(threads)
        self.torch = torch
        self.path = os.path.join(d, 'model.pt')
        sd = torch.load(self.path, map_location='cpu', weights_only=True)
        # architecture from shapes
        nst = 1 + max(int(m.group(1)) for k in sd for m in [re.match(r'encoder\.encoders\.(\d+)\.', k)] if m)
        def L(i): return f'encoder.encoders.{i}.' + ('' if i == 0 else 'encoder.') + 'layers.'
        layers = [1 + max(int(re.match(re.escape(L(i)) + r'(\d+)\.', k).group(1)) for k in sd if k.startswith(L(i))) for i in range(nst)]
        dim = [sd[L(i) + '0.feed_forward1.in_proj.weight'].shape[1] for i in range(nst)]
        ff = [sd[L(i) + '0.feed_forward2.in_proj.weight'].shape[0] for i in range(nst)]  # ff1 = 3/4, ff2 = 1x, ff3 = 5/4 of feedforward_dim
        ker = [sd[L(i) + '0.conv_module1.depthwise_conv.weight'].shape[2] for i in range(nst)]
        pos_dim = sd[L(0) + '0.self_attn_weights.linear_pos.weight'].shape[1]
        vhd = 12
        heads = [sd[L(i) + '0.self_attn1.in_proj.weight'].shape[0] // vhd for i in range(nst)]
        qhd = 32; phd = 4
        for i in range(nst):
            assert sd[L(i) + '0.self_attn_weights.in_proj.weight'].shape[0] == heads[i] * (2 * qhd + phd), i
        ds = [1] + [sd[f'encoder.encoders.{i}.downsample.bias'].shape[0] for i in range(1, nst)]
        feat = sd['encoder_embed.conv.0.weight'].shape[1]  # 1 channel; feature dim fixed by out.weight below
        emb_out = sd['encoder_embed.out.weight'].shape[1]  # 128 * ((feat_dim - 7) // 2 ... ) -> solve feat_dim
        feat_dim = next(f for f in (80, *range(40, 200)) if 128 * (((f - 1) // 2 - 1) // 2) == emb_out)  # 80 preferred (79 and 80 give the same shape)
        vocab, enc_out = sd['ctc_output.1.weight'].shape
        unmasked = [min(x, 256) for x in dim]
        self.arch = dict(num_encoder_layers=layers, encoder_dim=dim, feedforward_dim=ff, cnn_module_kernel=ker, num_heads=heads,
                         downsampling_factor=ds, query_head_dim=qhd, pos_head_dim=phd, value_head_dim=vhd, pos_dim=pos_dim,
                         feature_dim=feat_dim, vocab=vocab, encoder_unmasked_dim=unmasked)
        self.embed = Conv2dSubsampling(in_channels=feat_dim, out_channels=dim[0], dropout=0.0)
        self.enc = Zipformer2(output_downsampling_factor=2, downsampling_factor=tuple(ds), num_encoder_layers=tuple(layers),
                              encoder_dim=tuple(dim), encoder_unmasked_dim=tuple(unmasked), query_head_dim=(qhd,) * nst,
                              pos_head_dim=(phd,) * nst, value_head_dim=(vhd,) * nst, pos_dim=pos_dim, num_heads=tuple(heads),
                              feedforward_dim=tuple(ff), cnn_module_kernel=tuple(ker), dropout=0.0, warmup_batches=4000.0, causal=False)
        self.ctc = torch.nn.Linear(enc_out, vocab)
        assert enc_out == max(dim), (enc_out, dim)
        r1 = self.embed.load_state_dict({k[len('encoder_embed.'):]: v for k, v in sd.items() if k.startswith('encoder_embed.')}, strict=True)
        r2 = self.enc.load_state_dict({k[len('encoder.'):]: v for k, v in sd.items() if k.startswith('encoder.')}, strict=True)
        self.ctc.load_state_dict({'weight': sd['ctc_output.1.weight'], 'bias': sd['ctc_output.1.bias']}, strict=True)
        used = sum(1 for k in sd if k.startswith(('encoder_embed.', 'encoder.', 'ctc_output.')))
        unused = sorted({k.split('.')[0] for k in sd if not k.startswith(('encoder_embed.', 'encoder.', 'ctc_output.'))})
        for m in (self.embed, self.enc, self.ctc):
            m.eval()
        self.fbank = Fbank(FbankConfig(num_mel_bins=feat_dim, sampling_rate=SR))
        self.norm = norm
        self.sp = spm.SentencePieceProcessor()
        self.sp.Load(os.path.join(d, 'bpe.model'))
        assert self.sp.get_piece_size() == vocab, (self.sp.get_piece_size(), vocab)
        self.meta = {'format': f'icefall Zipformer2 state dict model.pt (fp32 PyTorch, torch.load weights_only=True); recipe files from k2-fsa/icefall 6fd6743; k2 stubbed (Swoosh forward only)',
                     'front_end': f'Lhotse Fbank {feat_dim} mel (kaldi-compatible, 25/10 ms, dither 0), per-utterance {"per-dim" if norm == "dim" else "global"} mean/std normalisation (model card)',
                     'decoder': 'greedy CTC on the auxiliary ctc_output head (log-softmax argmax), blank 0, sentencepiece decode',
                     'file': self.path, 'arch': self.arch, 'loaded_tensors': used, 'unused_heads': unused}

    def batch(self, wavs):
        torch = self.torch
        with torch.inference_mode():
            feats = []
            for w in wavs:
                f = torch.as_tensor(self.fbank.extract(torch.from_numpy(np.ascontiguousarray(w)), SR))
                if self.norm == 'dim':
                    f = (f - f.mean(0, keepdim=True)) / (f.std(0, keepdim=True) + 1e-5)
                else:
                    f = (f - f.mean()) / (f.std() + 1e-5)
                feats.append(f)
            T = max(f.shape[0] for f in feats)
            x = torch.zeros(len(feats), T, feats[0].shape[1])
            for i, f in enumerate(feats):
                x[i, :f.shape[0]] = f
            xl = torch.tensor([f.shape[0] for f in feats], dtype=torch.long)
            x, xl = self.embed(x, xl)
            mask = torch.arange(x.shape[1])[None, :] >= xl[:, None]
            e, el = self.enc(x.permute(1, 0, 2), xl, mask)
            lp = self.ctc(e.permute(1, 0, 2))  # argmax == log-softmax argmax
            out = []
            for b in range(len(wavs)):
                ids = lp[b, :int(el[b])].argmax(-1).tolist()
                col, prev = [], -1
                for i in ids:
                    if i != prev and i != 0:
                        col.append(int(i))
                    prev = i
                out.append(self.sp.decode(col))
            return out


def load(model):
    if model in KNOWN:
        spec = KNOWN[model]
    elif model.startswith('onnx:'):
        spec = ('onnx', model[5:])
    elif model.startswith('nemo:'):
        p = model[5:].split(':')
        spec = ('nemo', p[0], p[1] if len(p) > 1 else 'ctc')
    elif model.startswith('icefall:'):
        spec = ('icefall', model[8:])
    else:
        raise SystemExit(f'unknown model {model}')
    if spec[0] == 'icefall':
        return IcefallZipformerCTC(os.path.expanduser(spec[1]), threads=int(os.environ.get('HEARING_THREADS', 4)), norm=os.environ.get('HEARING_NORM', 'dim')), os.path.join(os.path.expanduser(spec[1]), 'model.pt')
    if spec[0] == 'onnx':
        spm_path = spec[2] if len(spec) > 2 else os.environ.get('HEARING_SPM', KARANBIR_SPM)
        blank = spec[3] if len(spec) > 3 else int(os.environ.get('HEARING_BLANK', 256))
        return OnnxCTC(spec[1], spm_path=spm_path, threads=int(os.environ.get('HEARING_THREADS', 4)), blank=blank), spec[1]
    return NemoHybrid(spec[1], spec[2], lang=os.environ.get('HEARING_LANG', 'pa'), threads=int(os.environ.get('HEARING_THREADS', 4))), spec[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--name', help='output folder name (default = --model)')
    ap.add_argument('--sample', default=os.path.join(HERE, 'hearing-sample.json'))
    ap.add_argument('--only', default='')
    ap.add_argument('--batch', type=int, default=16)
    ap.add_argument('--check', help='write transcripts of these window ends (clip:t,...) to stdout only (reference check)')
    a = ap.parse_args()
    eng, path = load(a.model)
    clips = json.load(open(a.sample))['clips']
    if a.check:
        want = {}
        for x in a.check.split(','):
            c, t = x.rsplit(':', 1)
            want.setdefault(c, set()).add(float(t))
        for clip in clips:
            if clip['id'] not in want:
                continue
            for t, w in windows(clip):
                if t in want[clip['id']]:
                    print(json.dumps({'clip': clip['id'], 't': t, 'text': eng.batch([w])[0]}, ensure_ascii=False))
        return
    name = a.name or a.model.replace('/', '_').replace(':', '_')
    od = os.path.join(OUT, name)
    os.makedirs(od, exist_ok=True)
    meta = dict(eng.meta, model=a.model, sha256=sha256(path), size=os.path.getsize(path), window_s=WIN, hop_s=HOP, started=time.strftime('%Y-%m-%d %H:%M'))
    only = set(filter(None, a.only.split(',')))
    T0 = time.time(); nw = 0
    for clip in clips:
        if only and clip['id'] not in only:
            continue
        f = os.path.join(od, f"{clip['id']}.jsonl")
        if os.path.exists(f) and not only:
            continue
        rows, buf = [], []
        for t, w in windows(clip):
            buf.append((t, w))
            if len(buf) == a.batch:
                rows += [{'t': tt, 'text': s} for (tt, _), s in zip(buf, eng.batch([x for _, x in buf]))]; buf = []
        if buf:
            rows += [{'t': tt, 'text': s} for (tt, _), s in zip(buf, eng.batch([x for _, x in buf]))]
        with open(f + '.tmp', 'w') as fh:
            fh.write(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
        os.replace(f + '.tmp', f)
        nw += len(rows)
        print(f"{name} {clip['id']}: {len(rows)} windows ({time.time() - T0:.0f} s)", flush=True)
    meta['seconds'] = round(time.time() - T0); meta['windows'] = nw
    json.dump(meta, open(os.path.join(od, 'meta.json'), 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
