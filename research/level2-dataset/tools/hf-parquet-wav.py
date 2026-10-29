"""hf-parquet-wav.py — helper of hf-ingest.js: write the audio of an STTM Desktop recording parquet
(khalisfoundation/sttm_desktop_*: one row, columns source_url, audio{bytes,path}, duration) to a WAV file.

  uv run -q --no-project --with pyarrow python -I hf-parquet-wav.py <in.parquet> <out.wav>

Prints a JSON line {rows, duration, source_url}. The bytes are written as stored (the recordings are WAV);
hf-ingest.js converts to 16 kHz mono PCM16 with ffmpeg if they are not already.
Run with -I (the parquet is downloaded data); pyarrow comes from the uv environment.
"""
import json
import sys

import pyarrow.parquet as pq


def main():
    src, dst = sys.argv[1], sys.argv[2]
    t = pq.read_table(src, columns=['audio', 'duration', 'source_url'])
    if t.num_rows != 1:
        raise SystemExit(f'{src}: expected 1 row, found {t.num_rows}')
    row = t.slice(0, 1).to_pylist()[0]
    audio = row['audio'] or {}
    data = audio.get('bytes')
    if not data:
        raise SystemExit(f'{src}: audio.bytes is empty')
    with open(dst, 'wb') as f:
        f.write(data)
    print(json.dumps({'rows': t.num_rows, 'duration': row.get('duration'), 'source_url': row.get('source_url'), 'bytes': len(data)}))


if __name__ == '__main__':
    main()
