export type Status = 'to_contact' | 'sent' | 'accepted' | 'replied' | 'conversation' | 'closed' | 'skipped' | 'reference';
export type Channel = 'email' | 'linkedin';
export type Outcome = 'positive' | 'declined' | 'no_reply' | 'bounced' | 'withdrawn';
export type EventType = 'imported' | 'sent' | 'skipped' | 'accepted' | 'messaged' | 'nudged' | 'replied' | 'status' | 'closed' | 'reopened' | 'note' | 'edited' | 'limit_override' | 'intro_requested';
