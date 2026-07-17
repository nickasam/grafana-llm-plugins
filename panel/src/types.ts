export interface HermesPanelOptions {
  appId: string;
  systemPrompt: string;
  placeholder: string;
  autoSummaryPrompt: string;
  maxRows: number;
}

export type Role = 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}
