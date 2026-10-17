"""Run inside the API container: python - < tests/test_auth_config.py."""
import os
import runpy
import unittest
from unittest.mock import patch


class AuthConfigTests(unittest.TestCase):
    def config(self, values):
        with patch.dict(os.environ, values, clear=True):
            return runpy.run_module('app.config')

    def test_blank_jwks_uses_configured_issuer(self):
        config = self.config({'CLERK_ISSUER': 'https://test.clerk.accounts.dev/', 'CLERK_JWKS_URL': ''})
        self.assertEqual(config['CLERK_JWKS_URL'], 'https://test.clerk.accounts.dev/.well-known/jwks.json')

    def test_explicit_jwks_is_preserved(self):
        config = self.config({'CLERK_ISSUER': 'https://test.clerk.accounts.dev', 'CLERK_JWKS_URL': 'https://keys.example.com/jwks'})
        self.assertEqual(config['CLERK_JWKS_URL'], 'https://keys.example.com/jwks')

    def test_issuer_whitespace_and_trailing_slash_are_normalized(self):
        config = self.config({'CLERK_ISSUER': ' https://test.clerk.accounts.dev/ '})
        self.assertEqual(config['CLERK_ISSUER'], 'https://test.clerk.accounts.dev')

    def test_unconfigured_issuer_does_not_invent_a_trusted_source(self):
        config = self.config({})
        self.assertEqual(config['CLERK_ISSUER'], '')
        self.assertEqual(config['CLERK_JWKS_URL'], '')


if __name__ == '__main__':
    unittest.main()
