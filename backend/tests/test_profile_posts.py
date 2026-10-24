"""Image validation/provider tests and an optional disposable-PostGIS lifecycle test."""
import os
import unittest
import uuid
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException

from app.services import profile_posts as media

PNG = b'\x89PNG\r\n\x1a\n' + b'test-image'


class MediaTests(unittest.IsolatedAsyncioTestCase):
    def test_only_supported_image_signatures(self):
        self.assertEqual(media.image_type(PNG), 'image/png')
        self.assertEqual(media.image_type(b'\xff\xd8\xff123'), 'image/jpeg')
        self.assertEqual(media.image_type(b'RIFF1234WEBP123'), 'image/webp')
        for data in [b'', b'<svg onload="alert(1)">', b'<html>', b'RIFF1234WAVE123']:
            with self.assertRaises(HTTPException) as error:
                media.image_type(data)
            self.assertEqual(error.exception.status_code, 415)

    def test_missing_cloud_configuration_is_explicit(self):
        with patch.object(media, 'CLOUDINARY_API_SECRET', ''):
            with self.assertRaises(HTTPException) as error:
                media.credentials()
            self.assertEqual(error.exception.status_code, 503)

    async def test_signed_upload_and_destroy_requests_and_provider_errors(self):
        public_id = 'playhud/profiles/player/photo'
        url = 'https://res.cloudinary.com/test-cloud/image/upload/v1/' + public_id + '.png'
        requests = []
        fail = False
        def respond(request):
            requests.append(request)
            if fail:
                return httpx.Response(503, json={'error': {'message': 'Internal provider details'}})
            if request.url.path.endswith('/destroy'):
                return httpx.Response(200, json={'result': 'ok'})
            return httpx.Response(200, json={'public_id': public_id, 'resource_type': 'image', 'secure_url': url})
        real_client = httpx.AsyncClient
        transport = httpx.MockTransport(respond)
        with patch.object(media, 'CLOUDINARY_CLOUD_NAME', 'test-cloud'), patch.object(media, 'CLOUDINARY_API_KEY', 'test-key'), patch.object(media, 'CLOUDINARY_API_SECRET', 'test-secret'), patch.object(media.httpx, 'AsyncClient', side_effect=lambda **kw: real_client(transport=transport, **kw)):
            self.assertEqual(await media.upload_image(PNG, public_id), url)
            body = requests[0].content.decode(errors='replace')
            self.assertIn('name="signature"', body)
            self.assertIn('name="allowed_formats"', body)
            self.assertIn(public_id, body)
            self.assertNotIn('test-secret', body)
            await media.delete_image(public_id)
            self.assertIn('invalidate=true', requests[1].content.decode())
            fail = True
            with self.assertRaises(HTTPException) as error:
                await media.upload_image(PNG, public_id)
            self.assertEqual(error.exception.status_code, 502)
            self.assertNotIn('Internal provider details', error.exception.detail)


@unittest.skipUnless(os.getenv('PLAYZO_DISPOSABLE_DB_TEST') == '1', 'Requires an explicitly disposable PostGIS database')
class PostsApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_upload_visibility_limits_and_owner_deletion(self):
        from app.config import DATABASE_URL
        from app.database import Session, engine
        from app.dependencies import current_user
        from app.evolve import evolve
        from app.main import app
        from app.models import ProfilePost, User, UserBlock
        self.assertIn('/playzo_test', DATABASE_URL)
        await evolve()
        async with Session() as db:
            owner = User(clerk_id='posts-owner-' + str(uuid.uuid4()), name='Owner', onboarding_completed=True, account_status='active', discovery_visible=True, phone='+919876543210', role='USER')
            viewer = User(clerk_id='posts-viewer-' + str(uuid.uuid4()), name='Viewer', onboarding_completed=True, account_status='active', role='USER')
            db.add_all([owner, viewer]); await db.commit(); await db.refresh(owner); await db.refresh(viewer)
        actor = owner
        app.dependency_overrides[current_user] = lambda: actor
        provider_upload = AsyncMock(return_value='https://res.cloudinary.com/test/image/upload/v1/photo.png')
        provider_delete = AsyncMock()
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                with patch.object(media, 'credentials'), patch.object(media, 'configured', return_value=True), patch.object(media, 'upload_image', provider_upload), patch.object(media, 'delete_image', provider_delete):
                    response = await client.post('/api/v1/users/me/posts?caption=Weekend%20game', content=PNG, headers={'Content-Type': 'image/png'})
                    self.assertEqual(response.status_code, 201, response.text)
                    post = response.json()
                    self.assertEqual(post['caption'], 'Weekend game')
                    self.assertNotIn('public_id', post)
                    self.assertEqual((await client.get('/api/v1/users/me/posts')).json()['posts'][0], post)
                    actor = viewer
                    public = await client.get('/api/v1/users/' + owner.id)
                    self.assertEqual(public.status_code, 200, public.text)
                    self.assertEqual(public.json()['posts'], [post])
                    self.assertNotIn('phone', public.json())
                    response = await client.delete('/api/v1/users/me/posts/' + post['id'])
                    self.assertEqual(response.status_code, 404)
                    provider_delete.assert_not_awaited()
                    # Hidden profiles must not leak photo lists through their public response.
                    async with Session() as db:
                        saved = await db.get(User, owner.id); saved.discovery_visible = False; await db.commit()
                    self.assertEqual((await client.get('/api/v1/users/' + owner.id)).status_code, 404)
                    async with Session() as db:
                        saved = await db.get(User, owner.id); saved.discovery_visible = True
                        db.add(UserBlock(blocker_id=owner.id, blocked_id=viewer.id)); await db.commit()
                    self.assertEqual((await client.get('/api/v1/users/' + owner.id)).status_code, 404)
                    actor = owner
                    response = await client.post('/api/v1/users/me/posts', content=b'<svg>')
                    self.assertEqual(response.status_code, 415)
                    with patch.object(media, 'MAX_IMAGE_BYTES', 8):
                        response = await client.post('/api/v1/users/me/posts', content=PNG)
                    self.assertEqual(response.status_code, 413)
                    with patch.object(media, 'MAX_POSTS', 1):
                        response = await client.post('/api/v1/users/me/posts', content=PNG)
                    self.assertEqual(response.status_code, 409)
                    self.assertEqual(provider_upload.await_count, 1)
                    response = await client.delete('/api/v1/users/me/posts/' + post['id'])
                    self.assertEqual(response.status_code, 204, response.text)
                    provider_delete.assert_awaited_once()
                    self.assertEqual((await client.get('/api/v1/users/me/posts')).json()['posts'], [])
                    self.assertEqual((await client.delete('/api/v1/users/me/posts/' + post['id'])).status_code, 404)
            app.dependency_overrides.clear()
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                self.assertEqual((await client.get('/api/v1/users/me/posts')).status_code, 401)
        finally:
            app.dependency_overrides.clear()
            await engine.dispose()
