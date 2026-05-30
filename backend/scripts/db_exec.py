from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg


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
        os.environ.setdefault(key, value)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: db_exec.py <sql-file>", file=sys.stderr)
        return 2

    root = Path(__file__).resolve().parents[2]
    load_env(root / ".env")
    dsn = os.environ.get("POSTGRES_URL_NON_POOLING") or os.environ.get("POSTGRES_URL")
    if not dsn:
        print("POSTGRES_URL or POSTGRES_URL_NON_POOLING is required", file=sys.stderr)
        return 1

    sql_path = Path(sys.argv[1]).resolve()
    sql = sql_path.read_text()

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()

    print(f"applied:{sql_path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
