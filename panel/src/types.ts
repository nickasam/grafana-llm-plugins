export interface HermesPanelOptions {
  appId: string;
  systemPrompt: string;
  placeholder: string;
  autoSummary: boolean;
  autoSummaryPrompt: string;
  maxRows: number;
  maxTurns: number;
  limitMessage: string;
}

export type Role = 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}
