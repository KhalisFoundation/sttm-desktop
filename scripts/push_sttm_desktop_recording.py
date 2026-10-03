#!/usr/bin/env python3
"""Upload one STTM Desktop recording folder to a private Hugging Face dataset.

<recording_dir> must contain <folder_name>.wav (16kHz mono) and
<folder_name>.csv (verseId,timestamp_seconds rows).
"""
import argparse
import io
import os
import subprocess
import sys
from pathlib import Path

os.environ["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"

REQUIREMENTS = ["datasets", "huggingface_hub", "soundfile"]


def dependencies_ready() -> bool:
    try:
        import datasets  # noqa: F401
        import huggingface_hub  # noqa: F401
        import soundfile  # noqa: F401
        return True
    except ImportError:
        return False


def install_dependencies() -> None:
    if dependencies_ready():
        print("python-dependencies 1")
        return
    print("python-dependencies installing")
    subprocess.check_call([sys.executable, "-m", "pip", "-q", "install", *REQUIREMENTS])
    if not dependencies_ready():
        raise SystemExit("python dependencies failed to import after install")
    print("python-dependencies 1")


install_dependencies()

import soundfile as sf
from datasets import Audio, Dataset
from huggingface_hub import HfApi, upload_file

SAMPLE_RATE = 16000
HF_TOKEN_ENV = "HF_TOKEN_KHALIS"


def sanitize(name: str) -> str:
    return name.replace("-", "_")


def format_duration(seconds: float) -> str:
    minutes, secs = divmod(int(round(seconds)), 60)
    return f"{minutes}:{secs:02d}"


def normalize_collection(name: str) -> str:
    return "_".join(name.strip().lower().split())


def build_readme(timestamp: str, collection: str, duration: float, dataset_type: str) -> str:
    return f"""---
license: cc-by-4.0
tags:
  - audio
  - gurbani
collection: {collection}
duration: {duration:.2f}
video_title: "STTM Desktop Recording {timestamp}"
text_source: verse_dataset
dataset_type: {dataset_type}
approved_count: 0
total_segments: 0
auto_approved_count: 0
---

# STTM Desktop Recording: {timestamp}

Audio captured from STTM Desktop.

## Metadata

| Field | Value |
|-------|-------|
| **Audio Duration** | {format_duration(duration)} |
| **Sample Rate** | {SAMPLE_RATE} Hz |
| **Channels** | Mono |
| **Collection** | {collection} |

## Files

| File | Description |
|------|-------------|
| verse_timestamps.csv | verseId,timestamp_seconds rows |
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("recording_dir", type=Path, help="Folder containing <timestamp>.wav + <timestamp>.csv")
    parser.add_argument("--collection", default="gurdwara_sahib_fremont",
                         help="Collection name written to README frontmatter")
    parser.add_argument("--dataset-type", choices=["paath", "kirtan"], default="kirtan",
                        help="README frontmatter dataset_type for this recording")
    parser.add_argument("--hf-token-env", default=HF_TOKEN_ENV,
                         help=f"Env var holding the HF write token (default: {HF_TOKEN_ENV})")
    args = parser.parse_args()

    args.collection = normalize_collection(args.collection)
    recording_dir = args.recording_dir.expanduser().resolve()
    if not recording_dir.is_dir():
        raise SystemExit(f"Not a directory: {recording_dir}")

    timestamp = recording_dir.name  # e.g. "2026-08-31T17-07-01-319Z"
    wav_path = recording_dir / f"{timestamp}.wav"
    csv_path = recording_dir / f"{timestamp}.csv"
    if not wav_path.is_file():
        raise SystemExit(f"Missing audio file: {wav_path}")
    if not csv_path.is_file():
        raise SystemExit(f"Missing verse timestamp CSV: {csv_path}")

    token = os.environ.get(args.hf_token_env)
    if not token:
        raise SystemExit(f"{args.hf_token_env} not set in environment")

    info = sf.info(wav_path)
    if info.samplerate != SAMPLE_RATE or info.channels != 1:
        raise SystemExit(
            f"Expected {SAMPLE_RATE}Hz mono, got {info.samplerate}Hz/{info.channels}ch: {wav_path}"
        )
    duration = info.frames / info.samplerate

    video_id = f"sttm_desktop_{sanitize(timestamp)}"
    owner = HfApi(token=token).whoami(token=token)["name"]
    repo_id = f"{owner}/youtube_watch_{video_id}"
    source_url = f"local://sttm-desktop/recordings/{timestamp}"

    print(f"Pushing {wav_path.name} ({format_duration(duration)}) -> {repo_id}")
    ds = Dataset.from_dict({
        "source_url": [source_url],
        "audio": [str(wav_path)],
        "duration": [duration],
    })
    ds = ds.cast_column("audio", Audio(sampling_rate=SAMPLE_RATE))
    # num_shards=1 avoids an "Index out of range" bug with single-row datasets.
    ds.push_to_hub(repo_id, token=token, private=True, num_shards=1)

    print("  Uploading verse_timestamps.csv...")
    upload_file(
        path_or_fileobj=csv_path,
        path_in_repo="verse_timestamps.csv",
        repo_id=repo_id, repo_type="dataset", token=token,
        commit_message="add verse_timestamps.csv",
    )

    print("  Uploading README.md...")
    readme = build_readme(timestamp, args.collection, duration, args.dataset_type)
    upload_file(
        path_or_fileobj=io.BytesIO(readme.encode("utf-8")),
        path_in_repo="README.md",
        repo_id=repo_id, repo_type="dataset", token=token,
        commit_message="add README.md",
    )

    print(f"\nDone: {repo_id}")


if __name__ == "__main__":
    main()
