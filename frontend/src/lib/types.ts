export type SportPreference = { sport: string; skill_level: string };
export type Profile = {
  id: string;
  name: string;
  phone: string | null;
  nickname: string | null;
  age: number | null;
  gender: string | null;
  motivation: string | null;
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
