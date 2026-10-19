CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
	id VARCHAR(36) NOT NULL, 
	clerk_id VARCHAR(255) NOT NULL, 
	name VARCHAR(150) NOT NULL, 
	phone VARCHAR(30), 
	bio TEXT, 
	onboarding_completed BOOLEAN NOT NULL, 
	search_radius_km INTEGER NOT NULL, 
	PRIMARY KEY (id)
)

;
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_clerk_id ON users (clerk_id);

CREATE TABLE IF NOT EXISTS connections (
	id VARCHAR(36) NOT NULL, 
	requester_id VARCHAR(36) NOT NULL, 
	receiver_id VARCHAR(36) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	introduction VARCHAR(500), 
	sport VARCHAR(60), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (requester_id, receiver_id), 
	FOREIGN KEY(requester_id) REFERENCES users (id), 
	FOREIGN KEY(receiver_id) REFERENCES users (id)
)

;

CREATE TABLE IF NOT EXISTS games (
	id VARCHAR(36) NOT NULL, 
	host_id VARCHAR(36) NOT NULL, 
	title VARCHAR(120) NOT NULL, 
	sport VARCHAR(60) NOT NULL, 
	venue VARCHAR(180) NOT NULL, 
	locality VARCHAR(160) NOT NULL, 
	starts_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	capacity INTEGER NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	approval_required BOOLEAN DEFAULT 'false' NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(host_id) REFERENCES users (id)
)

;

CREATE TABLE IF NOT EXISTS groups (
	id VARCHAR(36) NOT NULL, 
	owner_id VARCHAR(36) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	description TEXT NOT NULL, 
	sport VARCHAR(60) NOT NULL, 
	locality VARCHAR(160) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_id) REFERENCES users (id)
)

;

CREATE TABLE IF NOT EXISTS notifications (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	kind VARCHAR(40) NOT NULL, 
	payload JSON NOT NULL, 
	is_read BOOLEAN DEFAULT 'false' NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

;
CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications (user_id);

CREATE TABLE IF NOT EXISTS user_blocks (
	blocker_id VARCHAR(36) NOT NULL, 
	blocked_id VARCHAR(36) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (blocker_id, blocked_id), 
	FOREIGN KEY(blocker_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(blocked_id) REFERENCES users (id) ON DELETE CASCADE
)

;

CREATE TABLE IF NOT EXISTS user_locations (
	user_id VARCHAR(36) NOT NULL, 
	pincode VARCHAR(6) NOT NULL, 
	locality VARCHAR(160) NOT NULL, 
	city VARCHAR(160) NOT NULL, 
	state VARCHAR(160) NOT NULL, 
	street_address TEXT, 
	latitude FLOAT, 
	longitude FLOAT, 
	discovery_point geography(POINT,4326), 
	PRIMARY KEY (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;
CREATE INDEX IF NOT EXISTS idx_user_locations_discovery_point ON user_locations USING gist (discovery_point);

CREATE TABLE IF NOT EXISTS user_sports (
	user_id VARCHAR(36) NOT NULL, 
	sport VARCHAR(60) NOT NULL, 
	skill_level VARCHAR(20) NOT NULL, 
	PRIMARY KEY (user_id, sport), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;

CREATE TABLE IF NOT EXISTS conversations (
	id VARCHAR(36) NOT NULL, 
	kind VARCHAR(12) NOT NULL, 
	direct_key VARCHAR(80), 
	group_id VARCHAR(36), 
	game_id VARCHAR(36), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (direct_key), 
	UNIQUE (group_id), 
	FOREIGN KEY(group_id) REFERENCES groups (id) ON DELETE CASCADE, 
	UNIQUE (game_id), 
	FOREIGN KEY(game_id) REFERENCES games (id) ON DELETE CASCADE
)

;

CREATE TABLE IF NOT EXISTS game_invitations (
	id VARCHAR(36) NOT NULL, 
	game_id VARCHAR(36) NOT NULL, 
	sender_id VARCHAR(36) NOT NULL, 
	receiver_id VARCHAR(36) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (game_id, receiver_id), 
	FOREIGN KEY(game_id) REFERENCES games (id) ON DELETE CASCADE, 
	FOREIGN KEY(sender_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(receiver_id) REFERENCES users (id) ON DELETE CASCADE
)

;
CREATE INDEX IF NOT EXISTS ix_game_invitations_receiver_id ON game_invitations (receiver_id);
CREATE INDEX IF NOT EXISTS ix_game_invitations_game_id ON game_invitations (game_id);

CREATE TABLE IF NOT EXISTS game_participants (
	game_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	PRIMARY KEY (game_id, user_id), 
	FOREIGN KEY(game_id) REFERENCES games (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;

CREATE TABLE IF NOT EXISTS group_members (
	group_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	role VARCHAR(20) NOT NULL, 
	PRIMARY KEY (group_id, user_id), 
	FOREIGN KEY(group_id) REFERENCES groups (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;

CREATE TABLE IF NOT EXISTS membership_requests (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	group_id VARCHAR(36), 
	game_id VARCHAR(36), 
	status VARCHAR(20) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (group_id, user_id), 
	UNIQUE (game_id, user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(group_id) REFERENCES groups (id) ON DELETE CASCADE, 
	FOREIGN KEY(game_id) REFERENCES games (id) ON DELETE CASCADE
)

;
CREATE INDEX IF NOT EXISTS ix_membership_requests_user_id ON membership_requests (user_id);

CREATE TABLE IF NOT EXISTS conversation_members (
	conversation_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	joined_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	last_read_message_id BIGINT DEFAULT '0' NOT NULL, 
	PRIMARY KEY (conversation_id, user_id), 
	FOREIGN KEY(conversation_id) REFERENCES conversations (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

;

CREATE TABLE IF NOT EXISTS messages (
	id BIGSERIAL NOT NULL, 
	conversation_id VARCHAR(36) NOT NULL, 
	sender_id VARCHAR(36) NOT NULL, 
	client_id VARCHAR(36) NOT NULL, 
	body TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (conversation_id, sender_id, client_id), 
	FOREIGN KEY(conversation_id) REFERENCES conversations (id) ON DELETE CASCADE, 
	FOREIGN KEY(sender_id) REFERENCES users (id) ON DELETE CASCADE
)

;
CREATE INDEX IF NOT EXISTS ix_messages_conversation_id ON messages (conversation_id);
