"""Profile persistence and all five discovery levels against an evolved test database."""
import unittest
import uuid

import httpx
from fastapi import Header
from sqlalchemy import delete

from app.database import Session, engine
from app.dependencies import auth_sub
from app.evolve import evolve
from app.main import app
from app.models import User, Location, Sport


class ProfileApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_preferences_roundtrip_and_discovery(self):
        await evolve(check=True)
        ids = []
        subjects = []
        async def subject(x_test_user: str = Header(...)):
            return x_test_user
        app.dependency_overrides[auth_sub] = subject
        try:
            async with Session() as db:
                for _ in range(2):
                    user = User(clerk_id='profile-test-' + str(uuid.uuid4()), name='Player')
                    db.add(user)
                    await db.flush()
                    ids.append(user.id)
                    subjects.append(user.clerk_id)
                await db.commit()
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                payload = dict(name='Profile Player', nickname='Ace', age=28, gender='woman', motivation='comeback', looking_for='find_group', languages=[' Hindi ', 'English'], phone='9876543210', pincode='201014', locality='Indirapuram', city='Ghaziabad', latitude=28.6415, longitude=77.3737, sports=[dict(sport='Badminton', skill_level='intermediate')])
                headers = {'x-test-user': subjects[0]}
                response = await client.put('/api/v1/users/me/onboarding', headers=headers, json=payload)
                self.assertEqual(response.status_code, 200, response.text)
                me = (await client.get('/api/v1/users/me', headers=headers)).json()
                self.assertEqual(me['nickname'], 'Ace')
                self.assertEqual(me['age'], 28)
                self.assertEqual(me['gender'], 'woman')
                self.assertEqual(me['motivation'], 'comeback')
                self.assertEqual(me['looking_for'], 'find_group')
                self.assertEqual(me['languages'], ['Hindi', 'English'])
                self.assertEqual(me['phone'], '+919876543210')
                for level in ['hobby', 'beginner', 'intermediate', 'advanced', 'pro']:
                    payload['sports'][0]['skill_level'] = level
                    response = await client.put('/api/v1/users/me/onboarding', headers={'x-test-user': subjects[1]}, json=payload)
                    self.assertEqual(response.status_code, 200, response.text)
                    response = await client.get('/api/v1/discover/players', headers=headers, params={'sport': 'Badminton', 'skill_level': level})
                    self.assertEqual(response.status_code, 200, response.text)
                    players = response.json()
                    player = next(item for item in players if item['id'] == ids[1])
                    self.assertEqual(player['skill_level'], level)
                    self.assertTrue({'age', 'gender', 'phone', 'street_address'}.isdisjoint(player))
                response = await client.get('/api/v1/discover/players?skill_level=expert', headers=headers)
                self.assertEqual(response.status_code, 422)
        finally:
            app.dependency_overrides.pop(auth_sub, None)
            async with Session() as db:
                for model in [Sport, Location]:
                    await db.execute(delete(model).where(model.user_id.in_(ids)))
                await db.execute(delete(User).where(User.id.in_(ids)))
                await db.commit()
            await engine.dispose()


if __name__ == '__main__':
    unittest.main()
