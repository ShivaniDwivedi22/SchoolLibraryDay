"""Where the app keeps its files: %APPDATA%\\LibraryReminder on Windows."""

import os
from pathlib import Path


def data_dir() -> Path:
    override = os.environ.get("LDR_DATA_DIR")
    if override:
        base = Path(override)
    elif os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home())) / "LibraryReminder"
    else:
        base = Path.home() / ".library-reminder"
    base.mkdir(parents=True, exist_ok=True)
    return base


def config_file() -> Path:
    return data_dir() / "settings.json"


def state_file() -> Path:
    return data_dir() / "state.json"


def log_file() -> Path:
    return data_dir() / "log.txt"


def calendar_cache() -> Path:
    return data_dir() / "school-calendar.ics"


def google_client_secret() -> Path:
    return data_dir() / "client_secret.json"


def google_token() -> Path:
    return data_dir() / "google_token.json"
