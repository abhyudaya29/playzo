ALTER TABLE users
  ADD COLUMN product_analytics_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN analytics_consent_updated_at timestamptz;
ALTER TABLE activity_events
  ADD COLUMN posthog_sent_at timestamptz,
  ADD COLUMN posthog_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN posthog_retry_at timestamptz;
CREATE INDEX activity_events_delivery ON activity_events(created_at)
  WHERE posthog_sent_at IS NULL AND posthog_attempts < 10;
