-- Distinct authenticated usage, bucketed in the product timezone.
CREATE TABLE daily_active_users (
    user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day date NOT NULL,
    PRIMARY KEY (user_id, day)
);
CREATE INDEX daily_active_users_day ON daily_active_users(day);
CREATE TABLE daily_event_totals (
    day date NOT NULL,
    event_name varchar(60) NOT NULL,
    event_count integer NOT NULL,
    distinct_users integer NOT NULL,
    PRIMARY KEY (day, event_name)
);
