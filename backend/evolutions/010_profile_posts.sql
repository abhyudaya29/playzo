CREATE TABLE profile_posts (
    id varchar(36) PRIMARY KEY,
    user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_id varchar(255) NOT NULL UNIQUE,
    image_url varchar(2048) NOT NULL,
    caption varchar(500) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profile_posts_user_created_idx ON profile_posts(user_id, created_at DESC);
