CREATE INDEX IF NOT EXISTS ix_messages_conversation_history ON messages (conversation_id, id);
CREATE INDEX IF NOT EXISTS ix_conversation_members_user ON conversation_members (user_id);
CREATE INDEX IF NOT EXISTS ix_notifications_unread ON notifications (user_id, is_read);
