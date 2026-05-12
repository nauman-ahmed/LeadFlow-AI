export type Language = 'en' | 'fr';

export type LeadStatus = 'new' | 'qualified' | 'booked' | 'handoff' | 'lost';
export type LeadSource = 'web' | 'voice';
export type Channel = 'web' | 'voice';
export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';

export interface Lead {
  id: string;
  tenant_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  language: Language;
  source: LeadSource;
  status: LeadStatus;
  qualification_score: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface LeadOverview extends Lead {
  conversation_count: number;
  last_conversation_at: string | null;
  appointment_count: number;
}

export interface Conversation {
  id: string;
  lead_id: string;
  channel: Channel;
  external_id: string | null;
  language: Language;
  handoff: boolean;
  started_at: string;
  ended_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  prompt_version: string | null;
  created_at: string;
}
