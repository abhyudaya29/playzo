"""Guest input/rate tests, plus an opt-in preview lifecycle on a disposable PostGIS DB."""
import os
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import Depends, HTTPException
from pydantic import ValidationError

from app.routes.playground import PreviewInput, guest_limit


class GuestInputTests(unittest.IsolatedAsyncioTestCase):
    def test_location_is_bounded_and_required(self):
        for data in [{}, {'latitude': 28}, {'latitude': 91, 'longitude': 77},
                     {'latitude': float('nan'), 'longitude': 77}, {'pincode': '000000'},
                     {'pincode': '201014', 'radius_km': 26}, {'pincode': '201014', 'page': 1000}]:
            with self.assertRaises(ValidationError):
                PreviewInput(**data)
        self.assertEqual(PreviewInput(pincode='201014').kind, 'players')
        self.assertEqual(PreviewInput(latitude=28.64, longitude=77.37).radius_km, 10)

    async def test_guest_rate_limit_and_unavailable_cache(self):
        request = SimpleNamespace(client=SimpleNamespace(host='192.0.2.12'))
        with patch('app.routes.playground.valkey.incr', AsyncMock(return_value=41)) as increment:
            with self.assertRaises(HTTPException) as error:
                await guest_limit(request)
            self.assertEqual(error.exception.status_code, 429)
            self.assertNotIn('192.0.2.12', increment.call_args.args[0])
        with patch('app.routes.playground.valkey.incr', AsyncMock(side_effect=ConnectionError)):
            with self.assertRaises(HTTPException) as error:
                await guest_limit(request)
            self.assertEqual(error.exception.status_code, 503)


class ReverseAreaTests(unittest.IsolatedAsyncioTestCase):
    async def test_coarse_cached_area_excludes_street_details(self):
        from app.routes.locations import reverse_location
        response = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {
            'address': {'city': 'Ghaziabad', 'state': 'Uttar Pradesh', 'suburb': 'Indirapuram',
                        'postcode': '201014', 'country_code': 'in', 'road': 'Private road', 'house_number': '12'}
        })
        client = AsyncMock()
        client.get.return_value = response
        context = AsyncMock()
        context.__aenter__.return_value = client
        with patch('app.routes.locations.valkey.get', AsyncMock(return_value=None)), \
             patch('app.routes.locations.valkey.set', AsyncMock(return_value=True)), \
             patch('app.routes.locations.valkey.setex', AsyncMock()) as cache, \
             patch('app.routes.locations.httpx.AsyncClient', return_value=context):
            result = await reverse_location(28.6415234, 77.3737234)
        self.assertEqual(result, {'city': 'Ghaziabad', 'state': 'Uttar Pradesh', 'locality': 'Indirapuram', 'pincode': '201014'})
        self.assertEqual(client.get.call_args.kwargs['params']['lat'], 28.64)
        self.assertEqual(client.get.call_args.kwargs['params']['lon'], 77.37)
        self.assertNotIn('Private road', cache.call_args.args[2])

    async def test_cached_area_avoids_provider_and_busy_provider_fails_cleanly(self):
        from app.routes.locations import reverse_location
        with patch('app.routes.locations.valkey.get', AsyncMock(return_value='{"city":"Ghaziabad"}')), \
             patch('app.routes.locations.httpx.AsyncClient') as provider:
            self.assertEqual(await reverse_location(28.64, 77.37), {'city': 'Ghaziabad'})
            provider.assert_not_called()
        with patch('app.routes.locations.valkey.get', AsyncMock(return_value=None)), \
             patch('app.routes.locations.valkey.set', AsyncMock(return_value=False)):
            with self.assertRaises(HTTPException) as error:
                await reverse_location(28.64, 77.37)
            self.assertEqual(error.exception.status_code, 429)


@unittest.skipUnless(os.getenv('PLAYZO_DISPOSABLE_DB_TEST') == '1', 'Requires a disposable PostGIS database')
class GuestApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_public_previews_privacy_activity_and_participation_gates(self):
        from sqlalchemy import func
        from app.config import DATABASE_URL
        from app.database import Session, engine
        from app.dependencies import current_user, db_session
        from app.evolve import evolve
        from app.main import app
        from app.models import ActivityEvent, Game, GameParticipant, Group, GroupMember, Location, Sport, User
        self.assertIn('/playzo_test', DATABASE_URL)
        await evolve()
        users=[]
        async with Session() as db:
            for i in range(7):
                user=User(clerk_id='guest-test-'+str(uuid.uuid4()), name=f'Player{i} PrivateSurname', nickname='Public Ace' if i==0 else None,
                          phone='+919876543210', bio='Private profile bio', onboarding_completed=i!=4, account_status='suspended' if i==3 else 'active',
                          guest_preview_visible=i!=1, discovery_visible=i!=2, gender='woman', gender_visibility='private',
                          teammate_preference='women' if i==6 else 'no_preference')
                db.add(user); await db.flush(); users.append(user)
                lat,lon=(19.07,72.87) if i==5 else (28.6415,77.3737)
                db.add(Location(user_id=user.id,pincode='400001' if i==5 else '201014',locality='Indirapuram',city='Ghaziabad',state='Uttar Pradesh',latitude=lat,longitude=lon,street_address='Private street address',discovery_point=func.ST_SetSRID(func.ST_MakePoint(lon,lat),4326)))
                db.add(Sport(user_id=user.id,sport='Badminton',skill_level='beginner'))
            public=Group(owner_id=users[0].id,name='Public weekend crew',sport='Badminton',locality='Indirapuram',visibility='public',capacity=20)
            private=Group(owner_id=users[0].id,name='Private secret crew',sport='Badminton',locality='Indirapuram',visibility='private')
            unconsented=Group(owner_id=users[1].id,name='Not opted in',sport='Badminton',locality='Indirapuram',visibility='public')
            wrong_area=Group(owner_id=users[0].id,name='Different area',sport='Badminton',locality='Elsewhere',visibility='public')
            db.add_all([public,private,unconsented,wrong_area]); await db.flush()
            db.add(GroupMember(group_id=public.id,user_id=users[0].id,role='owner'))
            open_game=Game(host_id=users[0].id,title='A public preview game',sport='Badminton',venue='Private exact venue',locality='Indirapuram',starts_at=datetime.now(timezone.utc)+timedelta(days=1),capacity=2,status='open')
            full=Game(host_id=users[0].id,title='Full game',sport='Badminton',venue='Private venue',locality='Indirapuram',starts_at=datetime.now(timezone.utc)+timedelta(days=1),capacity=1,status='open')
            cancelled=Game(host_id=users[0].id,title='Cancelled',sport='Badminton',venue='Private venue',locality='Indirapuram',starts_at=datetime.now(timezone.utc)+timedelta(days=1),capacity=4,status='cancelled')
            past=Game(host_id=users[0].id,title='Past game',sport='Badminton',venue='Private venue',locality='Indirapuram',starts_at=datetime.now(timezone.utc)-timedelta(days=1),capacity=4,status='open')
            db.add_all([open_game,full,cancelled,past]);await db.flush()
            db.add(GameParticipant(game_id=full.id,user_id=users[0].id))
            db.add_all([
                ActivityEvent(user_id=users[0].id,event_name='user_signed_up'),
                ActivityEvent(user_id=users[1].id,event_name='user_signed_up'),
                ActivityEvent(user_id=users[0].id,event_name='group_joined',entity_type='group',entity_id=public.id),
                ActivityEvent(user_id=users[0].id,event_name='group_joined',entity_type='group',entity_id=private.id),
                ActivityEvent(user_id=users[0].id,event_name='message_sent'),
            ])
            await db.commit()
        async def no_limit(): pass
        app.dependency_overrides[guest_limit]=no_limit
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
                async def preview(kind='players',**extra):
                    response=await client.post('/api/v1/playground/recommendations',json={'pincode':'201014','kind':kind,**extra})
                    self.assertEqual(response.status_code,200,response.text)
                    return response.json()
                result=await preview()
                self.assertEqual([item['id'] for item in result['items']],[users[0].id])
                self.assertEqual(result['items'][0]['name'],'Public Ace')
                self.assertTrue(result['requires_signup'])
                self.assertEqual(set(result['items'][0]),{'id','name','sport','skill_level','area','description','action'})
                self.assertNotIn('Private',str(result))
                result=await preview(gender='woman')
                self.assertEqual({item['id'] for item in result['items']},{users[0].id,users[6].id})
                self.assertTrue(all('gender' not in item for item in result['items']))
                result=await preview(latitude=28.64,longitude=77.37)
                self.assertEqual([item['id'] for item in result['items']],[users[0].id])
                self.assertEqual((await preview(pincode='500001'))['items'],[])
                groups=(await preview('communities'))['items']
                self.assertEqual([item['id'] for item in groups],[public.id])
                self.assertNotIn('owner_id',groups[0]);self.assertNotIn('conversation_id',groups[0])
                games=(await preview('games'))['items']
                self.assertEqual([item['id'] for item in games],[open_game.id])
                self.assertNotIn('venue',games[0]);self.assertNotIn('host_id',games[0])
                feed=(await client.get('/api/v1/playground/activity')).json()['items']
                self.assertEqual(len(feed),2)
                self.assertTrue(all(item['name']=='Public Ace' for item in feed))
                self.assertEqual({item['message'] for item in feed},{'joined Playhud','joined a sports community'})
                for path,payload in [('/api/v1/connections',{'receiver_id':users[0].id}),('/api/v1/groups/'+public.id+'/join',{}),('/api/v1/games/'+open_game.id+'/join',{})]:
                    response=await client.post(path,json=payload)
                    self.assertEqual(response.status_code,401,response.text)
                self.assertEqual((await client.get('/api/v1/users/'+users[0].id)).status_code,401)
                self.assertEqual((await client.post('/api/v1/playground/recommendations',json={'pincode':'201014','sport':'Made-up sport'})).status_code,422)
                async def actor(db=Depends(db_session)):
                    return await db.get(User,users[0].id)
                app.dependency_overrides[current_user]=actor
                response=await client.patch('/api/v1/users/me/preferences',json={'guest_preview_visible':False})
                self.assertEqual(response.status_code,200,response.text)
                self.assertEqual((await preview())['items'],[])
                self.assertEqual((await preview('communities'))['items'],[])
                self.assertEqual((await client.get('/api/v1/playground/activity')).json()['items'],[])
        finally:
            app.dependency_overrides.clear();await engine.dispose()
