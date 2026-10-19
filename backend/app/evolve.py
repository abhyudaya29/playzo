"""Explicit SQL evolution runner. Never invoked by API startup."""
import asyncio
import hashlib
import sys
from pathlib import Path

import asyncpg

from app.config import DATABASE_URL

EVOLUTIONS = Path(__file__).resolve().parent.parent / 'evolutions'
LOCK_ID = 18004242


async def evolve(check: bool = False) -> None:
    conn = await asyncpg.connect(DATABASE_URL.replace('postgresql+asyncpg://', 'postgresql://'))
    try:
        await conn.execute('SELECT pg_advisory_lock($1)', LOCK_ID)
        await conn.execute('''CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now(), checksum TEXT
        )''')
        await conn.execute('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT')
        applied = {row['version']: row['checksum'] for row in await conn.fetch('SELECT version, checksum FROM schema_migrations')}
        pending = []
        legacy = []
        files = sorted(EVOLUTIONS.glob('[0-9]*_*.sql'))
        if not files:
            raise RuntimeError(f'No SQL evolutions found in {EVOLUTIONS}')
        for path in files:
            sql = path.read_text()
            digest = hashlib.sha256(sql.encode()).hexdigest()
            if path.stem in applied:
                if applied[path.stem] is not None and applied[path.stem] != digest:
                    raise RuntimeError(f'Applied evolution was changed: {path.name}. Add a new SQL file instead.')
                if applied[path.stem] is None:
                    legacy.append((digest, path.stem))
                continue  # Adopt entries from the previous Python runner.
            pending.append((path, sql, digest))
        if not pending:
            print('Database is up to date.')
        elif check:
            raise RuntimeError('Pending SQL evolutions: ' + ', '.join(path.name for path, _, _ in pending))
        if not check:
            for digest, version in legacy:
                await conn.execute('UPDATE schema_migrations SET checksum=$1 WHERE version=$2', digest, version)
        for path, sql, digest in pending:
            print(f'Applying {path.name}', flush=True)
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute('INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)', path.stem, digest)
    finally:
        await conn.close()  # Releases the session advisory lock even on failure.


if __name__ == '__main__':
    if sys.argv[1:] not in ([], ['--check']):
        raise SystemExit('Usage: python -m app.evolve [--check]')
    asyncio.run(evolve('--check' in sys.argv))
