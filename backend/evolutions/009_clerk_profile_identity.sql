-- Clerk owns account names/photos. Cache only verified Backend API profile data.
-- Retain legacy avatar tables/columns to avoid deleting existing user data.
ALTER TABLE users
  ADD COLUMN clerk_image_url varchar(2048),
  ADD COLUMN clerk_profile_synced_at timestamptz;
-- The illustrated flow uses a different step order. Retain all draft answers.
UPDATE users SET onboarding_step=0 WHERE NOT onboarding_completed;
