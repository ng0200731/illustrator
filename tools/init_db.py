"""Initialize the SQLite database from schema.sql."""

import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA_PATH = os.path.join(BASE_DIR, "sql", "schema.sql")

if os.environ.get("VERCEL"):
    DB_PATH = "/tmp/app.db"
else:
    DB_PATH = os.path.join(BASE_DIR, ".tmp", "app.db")


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with open(SCHEMA_PATH, "r") as f:
        schema = f.read()
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(schema)
    conn.close()
    print(f"Database initialized at {DB_PATH}")


if __name__ == "__main__":
    init_db()
