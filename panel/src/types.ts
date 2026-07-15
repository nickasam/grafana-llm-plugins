export interface HermesPanelOptions {
  appId: string;
  systemPrompt: string;
  placeholder: string;
}

export type Role = 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}
