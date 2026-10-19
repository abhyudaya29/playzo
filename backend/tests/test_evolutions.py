"""Run ONLY against a disposable database after applying the repository evolutions."""
import asyncio
import os
import tempfile
from pathlib import Path

import asyncpg
import app.evolve as runner
from app.config import DATABASE_URL


async def main():
    if os.environ.get('PLAYZO_DISPOSABLE_DB_TEST') != '1':
        raise RuntimeError('Requires PLAYZO_DISPOSABLE_DB_TEST=1 and a disposable database')
    await runner.evolve(check=True)
    await runner.evolve()  # Repeated runs preserve applied entries.
    conn = await asyncpg.connect(DATABASE_URL.replace('postgresql+asyncpg://', 'postgresql://'))
    try:
        assert await conn.fetchval('SELECT count(*) FROM schema_migrations') == 4
        # Simulate ledger rows written by the previous Python runner.
        await conn.execute("UPDATE schema_migrations SET checksum=NULL WHERE version='001_connections_and_game_approval'")
        await runner.evolve()
        assert await conn.fetchval("SELECT checksum IS NOT NULL FROM schema_migrations WHERE version='001_connections_and_game_approval'")
        with tempfile.TemporaryDirectory() as directory:
            original = runner.EVOLUTIONS
            runner.EVOLUTIONS = Path(directory)
            try:
                path = Path(directory) / '999_test.sql'
                path.write_text('CREATE TABLE evolution_rollback_test (id INTEGER); SELECT missing_column;')
                try:
                    await runner.evolve(check=True)
                except RuntimeError as error:
                    assert 'Pending SQL evolutions' in str(error)
                else:
                    raise AssertionError('Pending check did not fail')
                try:
                    await runner.evolve()
                except asyncpg.UndefinedColumnError:
                    pass
                else:
                    raise AssertionError('Invalid SQL did not fail')
                assert await conn.fetchval("SELECT to_regclass('evolution_rollback_test')") is None
                assert await conn.fetchval("SELECT count(*) FROM schema_migrations WHERE version='999_test'") == 0
                path.write_text('CREATE TABLE evolution_rollback_test (id INTEGER);')
                await runner.evolve()
                path.write_text('SELECT 1;')
                try:
                    await runner.evolve(check=True)
                except RuntimeError as error:
                    assert 'Applied evolution was changed' in str(error)
                else:
                    raise AssertionError('Changed checksum did not fail')
            finally:
                runner.EVOLUTIONS = original
                await conn.execute('DROP TABLE IF EXISTS evolution_rollback_test')
                await conn.execute("DELETE FROM schema_migrations WHERE version='999_test'")
        print('PASS: repeat runs, legacy ledger adoption, pending detection, rollback, checksum validation')
    finally:
        await conn.close()


if __name__ == '__main__':
    asyncio.run(main())
