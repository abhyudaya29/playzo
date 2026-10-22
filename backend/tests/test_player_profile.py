"""Profile input contracts; run with python -m unittest discover -s tests -p test_player_profile.py."""
import unittest
from pydantic import ValidationError
from app.schemas import OnboardInput, SportInput


class PlayerProfileTests(unittest.TestCase):
    def profile(self, **overrides):
        return OnboardInput(**dict(dict(name='Player', pincode='201014', locality='Indirapuram', city='Ghaziabad', sports=[{'sport': 'Badminton', 'skill_level': 'beginner'}]), **overrides))

    def test_existing_profile_payload_still_works(self):
        profile = self.profile()
        self.assertIsNone(profile.age)
        self.assertEqual(profile.languages, [])

    def test_five_levels_and_invalid_level(self):
        for level in ['hobby', 'beginner', 'intermediate', 'advanced', 'pro']:
            self.assertEqual(SportInput(sport='Tennis', skill_level=level).skill_level, level)
        with self.assertRaises(ValidationError):
            SportInput(sport='Tennis', skill_level='expert')

    def test_preferences_and_language_normalization(self):
        profile = self.profile(nickname='Ace', age=28, gender='non_binary', motivation='comeback', languages=[' Hindi ', 'hindi', 'English'])
        self.assertEqual(profile.languages, ['Hindi', 'English'])
        self.assertEqual(profile.motivation, 'comeback')

    def test_play_intent_and_other_gender(self):
        for intent in ['join_individually', 'find_group', 'host_games']:
            profile = self.profile(looking_for=intent, gender='other')
            self.assertEqual(profile.looking_for, intent)
            self.assertEqual(profile.gender, 'other')
        self.assertIsNone(self.profile().looking_for)

    def test_invalid_preferences_rejected(self):
        for change in [dict(age=0), dict(age=121), dict(gender='anything'), dict(looking_for='anything'), dict(motivation='anything'), dict(languages=[' ']), dict(languages=['a' * 41]), dict(languages=['English'] * 11), dict(name=' ')]:
            with self.subTest(change=change), self.assertRaises(ValidationError):
                self.profile(**change)


if __name__ == '__main__':
    unittest.main()
