export interface HermesJsonData {
  url?: string;
  model?: string;
  systemPrompt?: string;
}

export interface HermesSecureJsonData {
  token?: string;
}

export type Role = 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}
