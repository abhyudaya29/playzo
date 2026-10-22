"""Verify additive migrations against a database containing legacy player data."""
import os
from pathlib import Path
import shutil
import tempfile
import unittest
import uuid
import asyncpg
from app import evolve as runner


@unittest.skipUnless(os.getenv('PLAYZO_DISPOSABLE_DB_TEST')=='1','Requires an explicitly disposable database')
class UpgradeTests(unittest.IsolatedAsyncioTestCase):
    async def test_legacy_players_and_sports_are_preserved(self):
        if '/playzo_test' not in runner.DATABASE_URL:raise RuntimeError('Use a disposable playzo_test database')
        original_url,original_evolutions=runner.DATABASE_URL,runner.EVOLUTIONS
        base=original_url.rsplit('/',1)[0].replace('postgresql+asyncpg://','postgresql://')
        name='playzo_test_upgrade_'+uuid.uuid4().hex[:10]
        admin=await asyncpg.connect(original_url.replace('postgresql+asyncpg://','postgresql://'))
        conn=None
        try:
            await admin.execute('CREATE DATABASE '+name)
            runner.DATABASE_URL=base+'/'+name
            with tempfile.TemporaryDirectory() as directory:
                runner.EVOLUTIONS=Path(directory)
                for file in original_evolutions.glob('[0-9]*_*.sql'):
                    if int(file.name[:3])<5:shutil.copy(file,runner.EVOLUTIONS/file.name)
                await runner.evolve()
            conn=await asyncpg.connect(base+'/'+name)
            player_id=str(uuid.uuid4())
            await conn.execute("INSERT INTO users(id,clerk_id,name,onboarding_completed,search_radius_km,age) VALUES($1,'legacy-subject','Existing Player',true,10,28)",player_id)
            await conn.execute("INSERT INTO user_sports(user_id,sport,skill_level) VALUES($1,'Legacy Sport','advanced')",player_id)
            runner.EVOLUTIONS=original_evolutions
            await runner.evolve()
            row=await conn.fetchrow('SELECT name,age,adult_confirmed,role,search_radius_km FROM users WHERE id=$1',player_id)
            self.assertEqual(tuple(row),('Existing Player',28,True,'USER',10))
            self.assertEqual(await conn.fetchval('SELECT skill_level FROM user_sports WHERE user_id=$1',player_id),'advanced')
            self.assertTrue(await conn.fetchval("SELECT active FROM sports_catalog WHERE name='Legacy Sport'"))
            self.assertEqual(await conn.fetchval('SELECT count(*) FROM users'),1)
            await runner.evolve(check=True)
        finally:
            runner.DATABASE_URL,runner.EVOLUTIONS=original_url,original_evolutions
            if conn:await conn.close()
            await admin.execute('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)')
            await admin.close()


if __name__=='__main__':unittest.main()
