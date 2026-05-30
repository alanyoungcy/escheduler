from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from .config import get_database_dsn


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    with psycopg.connect(get_database_dsn(), row_factory=dict_row) as conn:
        yield conn
