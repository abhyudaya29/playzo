"""Policy and upload contracts; no services or credentials required."""
from types import SimpleNamespace
import unittest
from fastapi import HTTPException
from pydantic import ValidationError
from app.schemas import DraftInput, MatchingWeights, PreferencesInput, SettingsInput, TournamentInput
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

    def test_clerk_identity_uses_account_fields_only(self):
        from app.services.clerk_profile import account_identity
        name,url=account_identity(dict(first_name=' Signup ',last_name='Player',image_url='https://img.clerk.com/avatar',unsafe_metadata={'name':'Other','role':'SUPER_ADMIN'}))
        self.assertEqual(name,'Signup Player');self.assertEqual(url,'https://img.clerk.com/avatar')
        self.assertIsNone(account_identity({'image_url':'javascript:alert(1)'})[1])

    def test_completion_no_longer_depends_on_an_adult_checkbox(self):
        from app.services.platform import eligible
        self.assertTrue(eligible(SimpleNamespace(account_status='active',onboarding_completed=True,adult_confirmed=False)))

    def test_operational_events_reject_unregistered_or_sensitive_metadata(self):
        with self.assertRaises(ValueError): record(None,'user','arbitrary_event')
        with self.assertRaises(ValueError): record(None,'user','message_sent',body='private message')
        with self.assertRaises(ValueError): record(None,'user','profile_updated',gender='woman')


if __name__=='__main__': unittest.main()
