"""Content-free persistent attempt reservations, including uncertain/failed calls."""

from contextlib import closing
from decimal import Decimal
from pathlib import Path
import sqlite3
import time


class AgentError(Exception):
    def __init__(self, code: str, status: int = 503):
        self.code, self.status = code, status
        super().__init__(code)


class UsageLedger:
    def __init__(self, path: Path):
        self.path = path

    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=2)
        connection.execute("""CREATE TABLE IF NOT EXISTS attempts (
            request_id TEXT PRIMARY KEY, created REAL NOT NULL, model TEXT NOT NULL,
            state TEXT NOT NULL, prompt_tokens INTEGER, completion_tokens INTEGER,
            cost_usd TEXT, error_code TEXT)""")
        if 'reported_model' not in {row[1] for row in connection.execute('PRAGMA table_info(attempts)')}:
            connection.execute('ALTER TABLE attempts ADD COLUMN reported_model TEXT')
        return connection

    def remaining(self, limit: int) -> int:
        with closing(self.connect()) as connection:
            count = connection.execute("SELECT count(*) FROM attempts").fetchone()[0]
        return max(0, limit - count)

    def reserve(self, request_id: str, model: str, limit: int) -> None:
        now = time.time()
        with closing(self.connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            if connection.execute("SELECT 1 FROM attempts WHERE request_id=?", (request_id,)).fetchone():
                raise AgentError("duplicate_request", 409)
            if connection.execute("SELECT count(*) FROM attempts").fetchone()[0] >= limit:
                raise AgentError("attempt_limit", 429)
            if connection.execute("SELECT 1 FROM attempts WHERE state='reserved' AND created>?", (now - 45,)).fetchone():
                raise AgentError("busy", 429)
            connection.execute("INSERT INTO attempts(request_id,created,model,state) VALUES (?,?,?,'reserved')",
                               (request_id, now, model))
            connection.commit()

    def finish(self, request_id: str, state: str, usage: dict | None = None, cost: str | None = None,
               error: str | None = None, reported_model: str | None = None) -> None:
        usage = usage or {}
        def tokens(key):
            value = usage.get(key)
            return value if type(value) is int and 0 <= value <= 10**9 else None
        with closing(self.connect()) as connection:
            connection.execute("""UPDATE attempts SET state=?,prompt_tokens=?,completion_tokens=?,cost_usd=?,error_code=?,reported_model=?
                                  WHERE request_id=?""",
                               (state, tokens("prompt_tokens"), tokens("completion_tokens"), cost, error, reported_model, request_id))
            connection.commit()


def reported_cost(value: object) -> str | None:
    if isinstance(value, (str, int, float)) and not isinstance(value, bool):
        try:
            amount = Decimal(str(value))
            if amount.is_finite() and 0 <= amount <= 1000:
                return format(amount, 'f')
        except ArithmeticError:
            pass
    return None
