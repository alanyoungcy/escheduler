from __future__ import annotations

import os
from pathlib import Path


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ[key] = value


def get_database_dsn() -> str:
    root = Path(__file__).resolve().parents[2]
    load_env(root / ".env")
    dsn = os.environ.get("POSTGRES_URL_NON_POOLING") or os.environ.get("POSTGRES_URL")
    if not dsn:
        raise RuntimeError("POSTGRES_URL_NON_POOLING or POSTGRES_URL is required")
    return dsn
