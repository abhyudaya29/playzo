-- Additive evolution: keep all existing profiles, sports and social records.
ALTER TABLE users
  ADD COLUMN avatar_version varchar(36),
  ADD COLUMN adult_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN gender_self_description varchar(100),
  ADD COLUMN gender_visibility varchar(12) NOT NULL DEFAULT 'private',
  ADD COLUMN discovery_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN account_status varchar(20) NOT NULL DEFAULT 'active',
  ADD COLUMN role varchar(24) NOT NULL DEFAULT 'USER',
  ADD COLUMN participation_interests jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN teammate_preference varchar(20) NOT NULL DEFAULT 'no_preference',
  ADD COLUMN availability jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN onboarding_draft jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN onboarding_step integer NOT NULL DEFAULT 0,
  ADD COLUMN onboarding_completed_at timestamptz,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN last_active_at timestamptz,
  ADD CONSTRAINT user_role_valid CHECK (role IN ('USER','SUPER_ADMIN','OPERATIONS_ADMIN','TOURNAMENT_MODERATOR','SUPPORT_AGENT')),
  ADD CONSTRAINT user_status_valid CHECK (account_status IN ('active','suspended')),
  ADD CONSTRAINT user_gender_visibility_valid CHECK (gender_visibility IN ('private','public')),
  ADD CONSTRAINT user_teammate_preference_valid CHECK (teammate_preference IN ('women','men','mixed','no_preference')),
  ADD CONSTRAINT user_onboarding_step_valid CHECK (onboarding_step BETWEEN 0 AND 6);
UPDATE users SET adult_confirmed=true WHERE age >= 18;
UPDATE users SET onboarding_completed_at=now() WHERE onboarding_completed;
ALTER TABLE user_sports ADD COLUMN play_intention varchar(16) NOT NULL DEFAULT 'both'
  CHECK (play_intention IN ('casual','competitive','both'));
CREATE INDEX users_discovery_eligible ON users (account_status, onboarding_completed, discovery_visible);
CREATE TABLE user_avatars (
  user_id varchar(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content bytea NOT NULL CHECK (octet_length(content) <= 1048576)
);
CREATE TABLE sports_catalog (
  name varchar(60) PRIMARY KEY,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO sports_catalog(name) VALUES ('Badminton'),('Cricket'),('Football'),('Basketball'),('Tennis'),('Pickleball'),('Table Tennis'),('Volleyball'),('Running'),('Cycling');
INSERT INTO sports_catalog(name) SELECT DISTINCT sport FROM user_sports ON CONFLICT DO NOTHING;
CREATE TABLE platform_settings (
  id integer PRIMARY KEY CHECK (id=1),
  value jsonb NOT NULL
);
INSERT INTO platform_settings VALUES (1, '{"default_radius_km":5,"maximum_radius_km":50,"matching_weights":{"sport":0.3,"distance":0.3,"skill":0.2,"availability":0.2},"group_capacity":100,"organizer_approval_required":true,"feature_flags":{"tournaments":true}}');
CREATE TABLE organizer_profiles (
  user_id varchar(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  organization varchar(150) NOT NULL,
  experience varchar(2000) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','suspended')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by varchar(36) REFERENCES users(id),
  reviewed_at timestamptz
);
CREATE TABLE tournaments (
  id varchar(36) PRIMARY KEY,
  host_id varchar(36) NOT NULL REFERENCES users(id),
  title varchar(120) NOT NULL,
  sport varchar(60) NOT NULL REFERENCES sports_catalog(name),
  city varchar(160) NOT NULL,
  venue varchar(180) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL CHECK (capacity BETWEEN 2 AND 10000),
  rules varchar(5000) NOT NULL DEFAULT '',
  status varchar(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','published','registration_open','registration_closed','in_progress','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX tournaments_discovery ON tournaments (status, starts_at);
CREATE TABLE tournament_registrations (
  tournament_id varchar(36) REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id varchar(36) REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tournament_id,user_id)
);
CREATE TABLE moderation_reports (
  id varchar(36) PRIMARY KEY,
  reporter_id varchar(36) NOT NULL REFERENCES users(id),
  target_type varchar(16) NOT NULL CHECK (target_type IN ('user','group','game','tournament')),
  target_id varchar(36) NOT NULL,
  reason varchar(2000) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','dismissed')),
  internal_notes varchar(4000) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_reports_queue ON moderation_reports(status,created_at);
CREATE TABLE activity_events (
  id varchar(36) PRIMARY KEY,
  user_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  event_name varchar(60) NOT NULL,
  entity_type varchar(20),
  entity_id varchar(36),
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_events_user_time ON activity_events(user_id,created_at DESC);
CREATE INDEX activity_events_name_time ON activity_events(event_name,created_at DESC);
CREATE TABLE admin_audit_logs (
  id varchar(36) PRIMARY KEY,
  admin_id varchar(36) REFERENCES users(id),
  action varchar(60) NOT NULL,
  target_type varchar(20) NOT NULL,
  target_id varchar(60) NOT NULL,
  reason varchar(1000) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_logs_time ON admin_audit_logs(created_at DESC);
CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Admin audit logs are append-only'; END; $$;
CREATE TRIGGER immutable_admin_audit BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
