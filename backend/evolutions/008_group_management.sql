ALTER TABLE groups
  ADD COLUMN visibility varchar(12) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  ADD COLUMN capacity integer NOT NULL DEFAULT 100 CHECK (capacity BETWEEN 2 AND 1000);
CREATE TABLE group_invitations (
  id varchar(36) PRIMARY KEY,
  group_id varchar(36) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id varchar(36) NOT NULL REFERENCES users(id),
  receiver_id varchar(36) NOT NULL REFERENCES users(id),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id,receiver_id)
);
