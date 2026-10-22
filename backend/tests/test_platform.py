"""Policy and upload contracts; no services or credentials required."""
from io import BytesIO
from types import SimpleNamespace
import unittest
from fastapi import HTTPException
from PIL import Image
from pydantic import ValidationError
from app.schemas import DraftInput, MatchingWeights, PreferencesInput, SettingsInput, TournamentInput
from app.services.avatars import sanitize_avatar
from app.services.matching import compatible, match_score
from app.services.platform import record


def player(**kw):
    return SimpleNamespace(**(dict(teammate_preference='no_preference', gender='non_binary', gender_visibility='private', availability=[]) | kw))


class PlatformPolicyTests(unittest.TestCase):
    def test_private_gender_cannot_satisfy_filter(self):
        first = player(teammate_preference='women')
        self.assertFalse(compatible(first, player(gender='woman')))
        self.assertTrue(compatible(first, player(gender='woman', gender_visibility='public')))

    def test_mutual_preferences_and_inclusive_defaults(self):
        self.assertTrue(compatible(player(), player(teammate_preference='mixed')))
        self.assertFalse(compatible(player(gender='woman', gender_visibility='public'), player(teammate_preference='men')))
        self.assertTrue(compatible(player(gender='woman', gender_visibility='public'), player(teammate_preference='women')))

    def test_normalized_scoring_rewards_overlap_and_proximity(self):
        first=player(availability=[dict(weekday=5,time_slot='morning')])
        second=player(availability=[dict(weekday=5,time_slot='morning')])
        weights=dict(sport=.3,distance=.3,skill=.2,availability=.2)
        score,overlap,explanation=match_score(first,second,'beginner','beginner',0,5,weights)
        self.assertEqual(score,100)
        self.assertEqual(len(overlap),1)
        self.assertNotIn('gender',str(explanation))
        lower,_,_=match_score(first,player(),'beginner','pro',5,5,weights)
        self.assertEqual(lower,30)

    def test_draft_rejects_privilege_and_unbounded_data(self):
        for value in [dict(role='SUPER_ADMIN'),dict(account_status='active'),dict(bio='x'*1001),dict(availability=[dict(weekday=9,time_slot='night')])]:
            with self.subTest(value=value),self.assertRaises(ValidationError):
                DraftInput(step=1,profile=value)
        self.assertEqual(DraftInput(step=2,profile=dict(name='A',pincode='201',sports=[])).step,2)

    def test_weights_and_settings_validation(self):
        with self.assertRaises(ValidationError): MatchingWeights(sport=.3,distance=.3,skill=.3,availability=.3)
        with self.assertRaises(ValidationError): PreferencesInput(teammate_preference='assumed_from_gender')
        with self.assertRaises(ValidationError): PreferencesInput(role='SUPER_ADMIN')
        with self.assertRaises(ValidationError): SettingsInput(reason='Test settings',default_radius_km=50,maximum_radius_km=5,matching_weights=dict(sport=.3,distance=.3,skill=.2,availability=.2),group_capacity=100,organizer_approval_required=True,feature_flags={'tournaments':True})

    def test_avatar_is_resized_and_metadata_is_removed(self):
        original=BytesIO()
        exif=Image.Exif();exif[270]='private metadata'
        Image.new('RGB',(800,600),'indigo').save(original,format='JPEG',exif=exif)
        with Image.open(BytesIO(sanitize_avatar(original.getvalue()))) as sanitized:
            self.assertEqual(sanitized.size,(512,512))
            self.assertEqual(sanitized.format,'WEBP')
            self.assertFalse(sanitized.getexif())

    def test_rejects_invalid_or_oversized_uploads(self):
        for value in [b'<svg><script/></svg>',b'',b'a'*(5*1024*1024+1)]:
            with self.assertRaises(HTTPException): sanitize_avatar(value)

    def test_operational_events_reject_unregistered_or_sensitive_metadata(self):
        with self.assertRaises(ValueError): record(None,'user','arbitrary_event')
        with self.assertRaises(ValueError): record(None,'user','message_sent',body='private message')
        with self.assertRaises(ValueError): record(None,'user','profile_updated',gender='woman')


if __name__=='__main__': unittest.main()
