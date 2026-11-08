#!/usr/bin/env python3
"""Upload one STTM Desktop recording folder to a private Hugging Face dataset.

<recording_dir> must contain <folder_name>.wav (16kHz mono) and
<folder_name>.csv (verseId,timestamp_seconds rows).
"""
import argparse
import os
import subprocess
import sys
import time
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
from huggingface_hub import CommitOperationAdd, HfApi
from huggingface_hub.utils import HfHubHTTPError
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import Timeout as RequestsTimeout

SAMPLE_RATE = 16000
HF_TOKEN_ENV = "HF_TOKEN_KHALIS"


def sanitize(name: str) -> str:
    return name.replace("-", "_")


def format_duration(seconds: float) -> str:
    minutes, secs = divmod(int(round(seconds)), 60)
    return f"{minutes}:{secs:02d}"


def normalize_collection(name: str) -> str:
    return "_".join(name.strip().lower().split())


def resolve_repo_owner(token: str, namespace: str | None) -> str:
    """Dataset repos must live under an org the token can write to.

    whoami()["name"] is always the user, even for an org-scoped token, so using
    it as the repo namespace 403s when that user cannot create datasets.
    """
    me = HfApi(token=token).whoami(token=token)
    orgs = [org.get("name") for org in (me.get("orgs") or []) if org.get("name")]
    if namespace:
        if namespace not in orgs and namespace != me.get("name"):
            raise SystemExit(
                f"Token cannot write under namespace {namespace!r}. "
                f"Available orgs: {', '.join(orgs) or '(none)'}"
            )
        return namespace
    if len(orgs) == 1:
        return orgs[0]
    if not orgs:
        raise SystemExit(
            f"Token user {me.get('name')!r} is not a member of any org, "
            "so it cannot create a dataset under an org namespace."
        )
    raise SystemExit(
        "Token belongs to multiple orgs; pass --hf-namespace. "
        f"Available orgs: {', '.join(orgs)}"
    )


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


def retry_call(label: str, fn, attempts: int = 4):
    """Retry Hub calls that die with a dropped connection (RemoteDisconnected)."""
    delay = 2.0
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except (RequestsConnectionError, RequestsTimeout, HfHubHTTPError) as exc:
            retriable = not isinstance(exc, HfHubHTTPError) or (
                exc.response is not None and exc.response.status_code >= 500
            )
            if not retriable or attempt == attempts:
                raise
            print(f"  {label} failed ({exc.__class__.__name__}); retry {attempt}/{attempts - 1} in {delay:.0f}s")
            time.sleep(delay)
            delay *= 2


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("recording_dir", type=Path, help="Folder containing <timestamp>.wav + <timestamp>.csv")
    parser.add_argument("--collection", default="gurdwara_sahib_fremont",
                         help="Collection name written to README frontmatter")
    parser.add_argument("--dataset-type", choices=["paath", "kirtan"], default="kirtan",
                        help="README frontmatter dataset_type for this recording")
    parser.add_argument("--hf-token-env", default=HF_TOKEN_ENV,
                         help=f"Env var holding the HF write token (default: {HF_TOKEN_ENV})")
    parser.add_argument("--hf-namespace", default=None,
                         help="Org (or user) namespace for the dataset. "
                              "Defaults to the only org on the token.")
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
    owner = resolve_repo_owner(token, args.hf_namespace)
    repo_id = f"{owner}/{video_id}"
    source_url = f"local://sttm-desktop/recordings/{timestamp}"

    print(f"Pushing {wav_path.name} ({format_duration(duration)}) -> {repo_id}")
    ds = Dataset.from_dict({
        "source_url": [source_url],
        "audio": [str(wav_path)],
        "duration": [duration],
    })
    ds = ds.cast_column("audio", Audio(sampling_rate=SAMPLE_RATE))
    # num_shards=1 avoids an "Index out of range" bug with single-row datasets.
    retry_call(
        "dataset shard",
        lambda: ds.push_to_hub(repo_id, token=token, private=True, num_shards=1),
    )

    readme = build_readme(timestamp, args.collection, duration, args.dataset_type)
    print("  Uploading verse_timestamps.csv and README.md...")
    # One commit instead of two upload_file calls: the second commit was dying
    # with RemoteDisconnected after the shard upload succeeded.
    retry_call(
        "metadata commit",
        lambda: HfApi(token=token).create_commit(
            repo_id=repo_id,
            repo_type="dataset",
            operations=[
                CommitOperationAdd(path_in_repo="verse_timestamps.csv", path_or_fileobj=str(csv_path)),
                CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=readme.encode("utf-8")),
            ],
            commit_message="add verse_timestamps.csv and README.md",
        ),
    )

    print(f"\nDone: {repo_id}")


if __name__ == "__main__":
    main()
