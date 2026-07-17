import { PanelPlugin } from '@grafana/data';
import { ChatPanel } from './ChatPanel';
import { HermesPanelOptions } from './types';

export const plugin = new PanelPlugin<HermesPanelOptions>(ChatPanel).setPanelOptions((builder) => {
  return builder
    .addTextInput({
      path: 'appId',
      name: 'App plugin id',
      description: 'The Hermes Chat app plugin that provides the /resources/chat backend.',
      defaultValue: 'easyalgo-hermeschat-app',
    })
    .addTextInput({
      path: 'systemPrompt',
      name: 'System prompt',
      description: 'Per-panel prompt prepended to every request. Overrides the global prompt in the app settings.',
      defaultValue: '',
      settings: {
        useTextarea: true,
        rows: 6,
      },
    })
    .addTextInput({
      path: 'placeholder',
      name: 'Input placeholder',
      defaultValue: 'Type a message. Enter to send, Shift+Enter for newline.',
    })
    .addNumberInput({
      path: 'maxRows',
      name: 'Max rows in prompt',
      description: 'Maximum number of rows serialized into the auto-summary prompt (to avoid oversized requests).',
      defaultValue: 20,
    })
    .addTextInput({
      path: 'autoSummaryPrompt',
      name: 'Auto summary prompt',
      description:
        'Question sent to hermes on first load when the query returns data. The serialized rows are appended after this text.',
      defaultValue: '请基于以上 ES 数据，给出结构化摘要（任务/时间线/根本原因/影响范围/建议），结论优先。',
      settings: {
        useTextarea: true,
        rows: 3,
      },
    });
});
