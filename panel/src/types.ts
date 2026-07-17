export interface HermesPanelOptions {
  appId: string;
  systemPrompt: string;
  placeholder: string;
  autoSummary: boolean;
  autoSummaryPrompt: string;
  maxRows: number;
}

export type Role = 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}
