ALTER TABLE connections ADD COLUMN IF NOT EXISTS introduction VARCHAR(500);
ALTER TABLE connections ADD COLUMN IF NOT EXISTS sport VARCHAR(60);
ALTER TABLE connections ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE games ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT false;
UPDATE connections SET status = 'declined' WHERE status = 'rejected';
