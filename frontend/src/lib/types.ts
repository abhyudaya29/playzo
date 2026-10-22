export type SportPreference = {
  sport: string;
  skill_level: string;
  play_intention?: string;
};
export type Profile = {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  gender_self_description: string | null;
  gender_visibility: 'private' | 'public';
  discovery_visible: boolean;
  role:
    | 'USER'
    | 'SUPER_ADMIN'
    | 'OPERATIONS_ADMIN'
    | 'TOURNAMENT_MODERATOR'
    | 'SUPPORT_AGENT';
  participation_interests: string[];
  teammate_preference: string;
  availability: Availability[];
  onboarding_step: number;
  onboarding_draft: Record<string, unknown>;
  phone: string | null;
  nickname: string | null;
  age: number | null;
  gender: string | null;
  motivation: string | null;
  looking_for: string | null;
  languages: string[];
  onboarding_completed: boolean;
  search_radius_km: number;
  sports: SportPreference[];
  location: {
    pincode: string;
    locality: string;
    city: string;
    state: string;
    street_address: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
};
export const skillLevels = [
  { value: 'hobby', label: 'Hobby' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'pro', label: 'Pro' },
];

export type Availability = { weekday: number; time_slot: string };
