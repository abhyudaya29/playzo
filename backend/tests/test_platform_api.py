"""Full API tests ONLY on a disposable evolved PostGIS database.
PLAYZO_DISPOSABLE_DB_TEST=1 python -m unittest discover -s tests -p test_platform_api.py
"""
from datetime import datetime, timedelta, timezone
import os
import unittest
import uuid
from unittest.mock import patch

import httpx
from fastapi import Header
from sqlalchemy import func, select, text

from app.database import Session, engine
from app.dependencies import auth_sub
from app.evolve import evolve
from app.main import app
from app.models import ActivityEvent, AdminAuditLog, Location, OrganizerProfile, Sport, User
from app.worker import deliver_analytics


@unittest.skipUnless(os.getenv('PLAYZO_DISPOSABLE_DB_TEST')=='1','Requires an explicitly disposable database')
class PlatformApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from app.config import DATABASE_URL
        if '/playzo_test' not in DATABASE_URL: raise RuntimeError('Use the disposable playzo_test database')
        await evolve(check=True)
        async with Session() as db:
            await db.execute(text('TRUNCATE users CASCADE'))
            self.ids=[];self.subjects=[]
            for name,role in [('Viewer','USER'),('Player','USER'),('Admin','SUPER_ADMIN'),('Support','SUPPORT_AGENT'),('Third player','USER')]:
                user=User(clerk_id='feature-test-'+str(uuid.uuid4()),name=name,role=role,onboarding_completed=True)
                db.add(user);await db.flush()
                db.add(Sport(user_id=user.id,sport='Badminton',skill_level='intermediate'))
                db.add(Location(user_id=user.id,pincode='201014',locality='Indirapuram',city='Ghaziabad',state='Uttar Pradesh',latitude=28.6415,longitude=77.3737,discovery_point=func.ST_SetSRID(func.ST_MakePoint(77.3737,28.6415),4326)))
                self.ids.append(user.id);self.subjects.append(user.clerk_id)
            await db.commit()
        async def subject(x_test_user:str=Header(...)):return x_test_user
        app.dependency_overrides[auth_sub]=subject
        self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose();app.dependency_overrides.clear();await engine.dispose()

    async def call(self,method,path,actor=0,status=200,**kw):
        response=await self.client.request(method,'/api/v1'+path,headers={'x-test-user':self.subjects[actor],**kw.pop('headers',{})},**kw)
        self.assertEqual(response.status_code,status,response.text)
        return response.json() if response.headers.get('content-type','').startswith('application/json') else response

    async def test_new_signin_creates_one_unprivileged_user(self):
        subject='new-user-'+str(uuid.uuid4())
        for _ in range(2):
            response=await self.client.get('/api/v1/users/me',headers={'x-test-user':subject})
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json()['role'],'USER')
            self.assertNotIn('adult_confirmed',response.json())
        async with Session() as db:
            user_id=await db.scalar(select(User.id).where(User.clerk_id==subject))
            count=await db.scalar(select(func.count()).select_from(ActivityEvent).where(ActivityEvent.user_id==user_id,ActivityEvent.event_name=='user_signed_up'))
            self.assertEqual(count,1)

    async def test_clerk_photo_sync_updates_cards_and_requests(self):
        fetched=[]
        clerk_data={'id':self.subjects[1],'first_name':'Signup','last_name':'Player','image_url':'https://img.clerk.com/account-photo','unsafe_metadata':{'role':'SUPER_ADMIN'}}
        class ClerkClient:
            async def __aenter__(self):return self
            async def __aexit__(self,*args):pass
            async def get(self,url,headers):
                fetched.append(url)
                return httpx.Response(200,request=httpx.Request('GET',url),json=clerk_data)
        with patch('app.services.clerk_profile.CLERK_SECRET_KEY','test_secret'),patch('httpx.AsyncClient',return_value=ClerkClient()):
            photo=await self.call('POST','/users/me/clerk-sync',actor=1,json={'avatar_url':'https://attacker.example/photo','clerk_id':self.subjects[0]})
        self.assertEqual(photo,{'name':'Signup Player','avatar_url':'https://img.clerk.com/account-photo'})
        self.assertEqual(fetched,['https://api.clerk.com/v1/users/'+self.subjects[1]])
        cards=await self.call('GET','/discover/players')
        card=next(p for p in cards if p['id']==self.ids[1])
        self.assertEqual(card['avatar_url'],photo['avatar_url'])
        public=await self.call('GET','/users/'+self.ids[1])
        self.assertTrue({'phone','age','latitude','longitude','street_address','postal_code','clerk_id'}.isdisjoint(public))
        self.assertIsNone(public['gender'])
        await self.call('POST','/connections',json={'receiver_id':self.ids[1]})
        requests=await self.call('GET','/requests')
        self.assertEqual(requests[0]['person']['avatar_url'],photo['avatar_url'])
        me=await self.call('GET','/users/me',actor=1)
        self.assertEqual(me['role'],'USER')
        await self.call('PUT','/users/me/avatar',content=b'obsolete upload',status=404)
        clerk_data['image_url']='https://img.clerk.com/changed-photo'
        with patch('app.services.clerk_profile.CLERK_SECRET_KEY','test_secret'),patch('httpx.AsyncClient',return_value=ClerkClient()):
            await self.call('POST','/users/me/clerk-sync',actor=1)
        self.assertEqual((await self.call('GET','/users/'+self.ids[1]))['avatar_url'],clerk_data['image_url'])

    async def test_clerk_outage_preserves_cached_profile(self):
        async with Session() as db:
            user=await db.get(User,self.ids[0]);user.clerk_image_url='https://img.clerk.com/existing';await db.commit()
        class OfflineClient:
            async def __aenter__(self):return self
            async def __aexit__(self,*args):pass
            async def get(self,*args,**kwargs):raise httpx.ConnectError('Temporary outage')
        with patch('app.services.clerk_profile.CLERK_SECRET_KEY','test_secret'),patch('httpx.AsyncClient',return_value=OfflineClient()):
            await self.call('POST','/users/me/clerk-sync',status=503)
        self.assertEqual((await self.call('GET','/users/me'))['avatar_url'],'https://img.clerk.com/existing')

    async def test_onboarding_drafts_without_age_gate_and_partial_preferences(self):
        async with Session() as db:
            user=await db.get(User,self.ids[0]);user.onboarding_completed=False;await db.commit()
        await self.call('PATCH','/onboarding/me',json={'step':2,'profile':{'name':'Resume Me','pincode':'201','participation_interests':['join_games','host_tournaments']}})
        state=await self.call('GET','/onboarding/me')
        self.assertEqual(state['onboarding_step'],2);self.assertEqual(state['onboarding_draft']['name'],'Resume Me')
        await self.call('PATCH','/onboarding/me',json={'step':2,'profile':{'role':'SUPER_ADMIN'}},status=422)
        data=dict(name='Resume Me',age=17,pincode='201014',city='Ghaziabad',state='Uttar Pradesh',locality='Indirapuram',latitude=28.64,longitude=77.37,sports=[dict(sport='Badminton',skill_level='advanced',play_intention='competitive')],participation_interests=['join_games','host_tournaments'])
        await self.call('POST','/onboarding/complete',json=data)
        state=await self.call('GET','/users/me')
        self.assertEqual(state['role'],'USER');self.assertEqual(state['onboarding_draft'],{})
        self.assertEqual(state['sports'][0]['play_intention'],'competitive')
        self.assertEqual(state['age'],17)
        await self.call('GET','/discover/players')
        await self.call('GET','/users/'+self.ids[0],actor=1)
        await self.call('POST','/connections',json={'receiver_id':self.ids[1]})
        await self.call('PATCH','/users/me/preferences',json={'discovery_visible':False})
        await self.call('PATCH','/users/me/preferences',json={'search_radius_km':10})
        preferences=await self.call('GET','/users/me/preferences')
        self.assertFalse(preferences['discovery_visible'])
        self.assertEqual(preferences['search_radius_km'],10)

    async def test_discovery_privacy_mutual_filters_and_blocks(self):
        async with Session() as db:
            first=await db.get(User,self.ids[0]);first.teammate_preference='women'
            other=await db.get(User,self.ids[1]);other.gender='woman';other.gender_visibility='private'
            await db.commit()
        result=await self.call('GET','/discovery/players')
        self.assertNotIn(self.ids[1],[p['id'] for p in result['items']])
        await self.call('PATCH','/users/me/preferences',actor=1,json={'gender_visibility':'public'})
        result=await self.call('GET','/discovery/players')
        self.assertIn(self.ids[1],[p['id'] for p in result['items']])
        await self.call('PATCH','/users/me/preferences',actor=1,json={'teammate_preference':'men'})
        result=await self.call('GET','/discovery/players')
        self.assertNotIn(self.ids[1],[p['id'] for p in result['items']])
        await self.call('PATCH','/users/me/preferences',actor=1,json={'teammate_preference':'no_preference'})
        await self.call('POST','/blocks',json={'blocked_id':self.ids[1]})
        await self.call('GET','/users/'+self.ids[1],status=404)
        result=await self.call('GET','/discovery/players')
        self.assertNotIn(self.ids[1],[p['id'] for p in result['items']])

    async def test_rbac_moderation_audit_and_metrics(self):
        await self.call('GET','/admin/overview',status=403)
        await self.call('GET','/admin/settings',actor=3,status=403)
        await self.call('GET','/admin/audit-logs',actor=3,status=403)
        await self.call('POST',f'/admin/users/{self.ids[1]}/suspend',actor=3,json={'reason':'Support cannot suspend'},status=403)
        await self.call('POST',f'/admin/users/{self.ids[1]}/suspend',actor=2,json={'reason':'Review of repeated abuse'})
        await self.call('GET','/users/me',actor=1,status=403)
        cards=await self.call('GET','/discover/players')
        self.assertNotIn(self.ids[1],[p['id'] for p in cards])
        audit=await self.call('GET','/admin/audit-logs',actor=2)
        self.assertEqual(audit['total'],1)
        async with Session() as db:
            with self.assertRaises(Exception):
                await db.execute(text('UPDATE admin_audit_logs SET reason=\'tamper\''))
            await db.rollback()
        await self.call('POST',f'/admin/users/{self.ids[1]}/reactivate',actor=2,json={'reason':'Review complete, restored'})
        await self.call('GET','/users/me',actor=1)
        overview=await self.call('GET','/admin/overview',actor=2)
        self.assertEqual(overview['metrics']['total_users'],5)
        for path in ['/admin/users','/admin/activity','/admin/analytics/funnel','/admin/analytics/retention','/admin/analytics/overview','/admin/groups','/admin/games','/admin/tournaments']:
            await self.call('GET',path,actor=2)
        await self.call('GET','/admin/users/'+self.ids[1],actor=2)
        await self.call('GET','/admin/activity/export',actor=2)

    async def test_group_private_invitation_roles_and_capacity(self):
        connection=await self.call('POST','/connections',json={'receiver_id':self.ids[1]})
        await self.call('PATCH',f'/connections/{connection["id"]}/accept',actor=1)
        group=await self.call('POST','/groups',json={'name':'Private crew','sport':'Badminton','visibility':'private','capacity':2})
        self.assertEqual(await self.call('GET','/groups',actor=1),[])
        await self.call('POST',f'/groups/{group["id"]}/join',actor=1,status=403)
        invitation=await self.call('POST',f'/groups/{group["id"]}/invitations',json={'receiver_id':self.ids[1]})
        entries=await self.call('GET','/requests',actor=1)
        self.assertTrue(any(e['kind']=='group_invitation' for e in entries))
        await self.call('PATCH',f'/requests/group_invitation/{invitation["id"]}/accept',actor=1)
        members=await self.call('GET',f'/groups/{group["id"]}/members')
        self.assertEqual(len(members),2)
        await self.call('PATCH',f'/groups/{group["id"]}/members/{self.ids[1]}',json={'role':'admin'})
        await self.call('DELETE',f'/groups/{group["id"]}/members/me',actor=1)
        await self.call('GET',f'/groups/{group["id"]}/members',actor=1,status=404)
        await self.call('POST',f'/groups/{group["id"]}/invitations',json={'receiver_id':self.ids[1]})
        await self.call('GET','/discovery/groups')
        await self.call('GET','/discovery/games')

    async def test_tournament_verified_organizer_state_machine_and_registration(self):
        await self.call('POST','/organizers/me',json={'organization':'Sports club','experience':'We organize badminton every weekend.'})
        now=datetime.now(timezone.utc)
        data=dict(title='Local tournament',sport='Badminton',city='Ghaziabad',venue='Sports club',starts_at=(now+timedelta(days=2)).isoformat(),ends_at=(now+timedelta(days=3)).isoformat(),capacity=2,rules='Adults only; bring a racket.')
        t=await self.call('POST','/tournaments',json=data)
        path=f'/tournaments/{t["id"]}'
        await self.call('PATCH',path,json={**data,'title':'Updated draft'})
        await self.call('PATCH',path,actor=1,json=data,status=404)
        await self.call('POST',path+'/transition',json={'status':'published','reason':'Skip required approval'},status=409)
        await self.call('POST',path+'/transition',json={'status':'pending_approval','reason':'Ready for tournament review'},status=403)
        await self.call('POST',f'/admin/organizers/{self.ids[0]}/review',actor=2,json={'status':'verified','reason':'Organizer history reviewed'})
        await self.call('POST',path+'/transition',json={'status':'pending_approval','reason':'Ready for tournament review'})
        await self.call('POST',path+'/transition',json={'status':'published','reason':'Self-approval is forbidden'},status=403)
        await self.call('POST',path+'/transition',actor=2,json={'status':'published','reason':'Approved after rules review'})
        await self.call('POST',path+'/transition',json={'status':'registration_open','reason':'Open player registration'})
        await self.call('POST',path+'/register',actor=1)
        await self.call('POST',path+'/register',actor=1) # Idempotent.
        await self.call('POST',path+'/register',actor=4)
        await self.call('POST',path+'/register',actor=3,status=409)
        players=await self.call('GET',path+'/participants')
        self.assertEqual(len(players['items']),2)
        await self.call('POST',path+'/transition',json={'status':'registration_closed','reason':'The event is at capacity'})
        await self.call('POST',path+'/transition',json={'status':'in_progress','reason':'Cannot begin early'},status=409)
        await self.call('DELETE',path+'/register',actor=1)

    async def test_connection_abuse_limit(self):
        async with Session() as db:
            for _ in range(30):db.add(ActivityEvent(user_id=self.ids[0],event_name='connection_requested',payload={}))
            await db.commit()
        await self.call('POST','/connections',json={'receiver_id':self.ids[1]},status=429)

    async def test_host_game_completion_and_cancellation(self):
        from app.models import Game
        data=dict(title='Host game',sport='Badminton',venue='Sports club',starts_at=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat(),capacity=4)
        game=await self.call('POST','/games',json=data)
        path='/games/'+game['id']+'/transition'
        await self.call('POST',path,actor=1,json={'status':'cancelled'},status=404)
        await self.call('POST',path,json={'status':'completed'},status=409)
        async with Session() as db:
            row=await db.get(Game,game['id']);row.starts_at=datetime.now(timezone.utc)-timedelta(hours=1);await db.commit()
        games=await self.call('GET','/games')
        self.assertIn(game['id'],[row['id'] for row in games])
        await self.call('POST',path,json={'status':'completed'})
        await self.call('POST',path,json={'status':'cancelled'},status=409)

    async def test_reports_and_typed_events_no_message_metadata(self):
        report=await self.call('POST','/reports',json={'target_type':'user','target_id':self.ids[1],'reason':'Repeated unwanted connection attempts'})
        await self.call('PATCH',f'/admin/reports/{report["id"]}',actor=3,json={'status':'in_review','reason':'Assigned for moderation review','internal_notes':'Review connection history'})
        await self.call('GET','/admin/reports',actor=0,status=403)
        async with Session() as db:
            events=(await db.execute(select(ActivityEvent))).scalars().all()
            self.assertTrue(any(e.event_name=='user_reported' for e in events))
            for event in events:self.assertTrue({'phone','gender','body','latitude','longitude'}.isdisjoint(event.payload))

    async def test_posthog_retry_does_not_change_primary_transaction(self):
        await self.call('PATCH','/users/me/analytics-consent',json={'allowed':True})
        await self.call('PATCH','/users/me',json={'name':'Survives outage','bio':None})
        class OfflineClient:
            async def __aenter__(self):return self
            async def __aexit__(self,*args):pass
            async def post(self,*args,**kwargs):raise httpx.ConnectError('PostHog unavailable')
        with patch.dict(os.environ,{'POSTHOG_PROJECT_KEY':'test_project','POSTHOG_HOST':'https://analytics.example'}),patch('httpx.AsyncClient',return_value=OfflineClient()):
            await deliver_analytics()
        me=await self.call('GET','/users/me')
        self.assertEqual(me['name'],'Survives outage')
        async with Session() as db:
            result=(await db.execute(text("SELECT posthog_attempts,posthog_sent_at,posthog_retry_at FROM activity_events WHERE user_id=:id AND event_name='profile_updated'"),{'id':self.ids[0]})).one()
            self.assertEqual(result[0],1);self.assertIsNone(result[1]);self.assertIsNotNone(result[2])

    async def test_posthog_outbox_requires_consent_and_deduplicates(self):
        await self.call('PATCH','/users/me/analytics-consent',json={'allowed':True})
        await self.call('PATCH','/users/me',json={'name':'Updated player','bio':'A public player bio'})
        sent=[]
        class Client:
            async def __aenter__(self):return self
            async def __aexit__(self,*args):pass
            async def post(self,url,json):
                sent.append(json)
                return httpx.Response(200,request=httpx.Request('POST',url),json={'status':1})
        with patch.dict(os.environ,{'POSTHOG_PROJECT_KEY':'test_project','POSTHOG_HOST':'https://analytics.example'}),patch('httpx.AsyncClient',return_value=Client()):
            await deliver_analytics();await deliver_analytics()
            self.assertEqual(len(sent),1)
            self.assertEqual(sent[0]['properties']['distinct_id'],self.ids[0])
            self.assertNotIn('bio',str(sent[0]))
            await self.call('PATCH','/users/me/analytics-consent',json={'allowed':False})
            await self.call('PATCH','/users/me',json={'name':'Opted out','bio':None})
            await deliver_analytics();self.assertEqual(len(sent),1)


if __name__=='__main__':unittest.main()
