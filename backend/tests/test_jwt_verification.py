"""JWT trust-boundary tests use ephemeral signing keys; no Clerk network calls."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from app import dependencies


class JwtVerificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key=rsa.generate_private_key(public_exponent=65537,key_size=2048)

    def claims(self,**changes):
        return dict(sub='test-clerk-user',exp=datetime.now(timezone.utc)+timedelta(minutes=5),iss='https://trusted.clerk.test')|changes

    def verify(self,claims):
        token=jwt.encode(claims,self.key,algorithm='RS256')
        client=SimpleNamespace(get_signing_key_from_jwt=lambda _:SimpleNamespace(key=self.key.public_key()))
        with patch.object(dependencies,'CLERK_ISSUER','https://trusted.clerk.test'),patch.object(dependencies,'CLERK_JWKS_URL','https://trusted.clerk.test/jwks'),patch.object(dependencies,'CLERK_AUDIENCE',''),patch.object(dependencies,'signing_keys',return_value=client):
            return dependencies.verify_token(token)

    def test_valid_signed_subject(self):self.assertEqual(self.verify(self.claims())['sub'],'test-clerk-user')

    def test_wrong_issuer_expired_or_missing_subject(self):
        for changes in [dict(iss='https://untrusted.test'),dict(exp=datetime.now(timezone.utc)-timedelta(minutes=5)),dict(sub='')]:
            with self.subTest(changes=changes),self.assertRaises(HTTPException) as error:self.verify(self.claims(**changes))
            self.assertEqual(error.exception.status_code,401)

    def test_missing_authorization(self):
        for header in [None,'','Basic token']:
            with self.subTest(header=header),self.assertRaises(HTTPException) as error:dependencies.auth_sub(header)
            self.assertEqual(error.exception.status_code,401)


if __name__=='__main__':unittest.main()
