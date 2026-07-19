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
    .addBooleanSwitch({
      path: 'autoSummary',
      name: 'Auto-summary on first load',
      description: '首次拿到查询结果时，自动向 Hermes 发送一次结构化摘要请求。',
      defaultValue: true,
    })
    .addNumberInput({
      path: 'maxTurns',
      name: 'Max conversation turns',
      description: 'Maximum user+assistant rounds per session. -1 means unlimited. Auto-summary counts as one turn.',
      defaultValue: -1,
    })
    .addTextInput({
      path: 'limitMessage',
      name: 'Limit reached message',
      description: '达到轮数上限时展示的提示。占位符 {max} 会被替换为配置的轮数。',
      defaultValue: '已达到本次会话轮数上限（{max} 轮），点击 New chat 开启新会话。',
      settings: {
        useTextarea: true,
        rows: 2,
      },
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
