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
    });
});
