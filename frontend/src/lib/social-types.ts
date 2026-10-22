export type SocialRequest = {
  id: string;
  kind: 'connection' | 'group' | 'game' | 'invitation' | 'group_invitation';
  status: 'pending' | 'accepted' | 'declined';
  direction: 'incoming' | 'outgoing';
  person: { id: string; name: string; avatar_url?: string | null };
  title: string;
  sport?: string;
  introduction?: string;
  created_at: string;
  conversation_id: string | null;
  can_respond: boolean;
  venue?: string;
  starts_at?: string;
};
export type ChatMessage = {
  id: number;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  client_id: string;
  created_at: string;
};
export type Conversation = {
  id: string;
  kind: 'direct' | 'group' | 'game';
  title: string;
  group_id: string | null;
  game_id: string | null;
  members: { id: string; name: string }[];
  unread_count: number;
  last_message: ChatMessage | null;
  created_at: string;
};
export type MessageHistory = {
  messages: ChatMessage[];
  next_before: number | null;
};
export type Activity = {
  requests: number;
  messages: number;
  notifications: number;
};
export function refreshActivity() {
  window.dispatchEvent(new Event('playzo:activity'));
}
