-- Public previews require a separate opt-in; existing authenticated discovery is unchanged.
ALTER TABLE users ADD COLUMN guest_preview_visible boolean NOT NULL DEFAULT false;
CREATE INDEX users_guest_preview_idx ON users(id)
  WHERE guest_preview_visible = true AND discovery_visible = true AND onboarding_completed = true;
CREATE INDEX IF NOT EXISTS user_locations_pincode_idx ON user_locations(pincode);
