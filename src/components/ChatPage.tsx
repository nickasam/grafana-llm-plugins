import React, { useReducer, useRef, useCallback, useEffect } from 'react';
import { GrafanaTheme2, renderMarkdown } from '@grafana/data';
import { config } from '@grafana/runtime';
import { Button, TextArea, useStyles2, Icon, Spinner } from '@grafana/ui';
import { css, cx } from '@emotion/css';
import { Message } from '../types';

interface Props {
  pluginId: string;
}

interface State {
  messages: Message[];
  input: string;
  streaming: boolean;
  error: string | null;
}

type Action =
  | { type: 'setInput'; value: string }
  | { type: 'send' } // pushes user msg + empty assistant msg, sets streaming
  | { type: 'appendDelta'; value: string }
  | { type: 'done' }
  | { type: 'error'; value: string }
  | { type: 'reset' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'setInput':
      return { ...state, input: action.value };
    case 'send':
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: 'user', content: state.input.trim() },
          { role: 'assistant', content: '' },
        ],
        input: '',
        streaming: true,
        error: null,
      };
    case 'appendDelta': {
      const messages = state.messages.slice();
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        messages[messages.length - 1] = {
          ...last,
          content: last.content + action.value,
        };
      }
      return { ...state, messages };
    }
    case 'done':
      return { ...state, streaming: false };
    case 'error':
      return { ...state, streaming: false, error: action.value };
    case 'reset':
      return { messages: [], input: '', streaming: false, error: null };
    default:
      return state;
  }
}

const initialState: State = {
  messages: [],
  input: '',
  streaming: false,
  error: null,
};

// Prefix API paths with Grafana's appSubUrl so requests work when Grafana is
// mounted under a subpath (e.g. /grafana behind an Ingress).
function apiUrl(path: string): string {
  const base = (config.appSubUrl || '').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : '/' + path}`;
}

export const ChatPage: React.FC<Props> = ({ pluginId }) => {
  const styles = useStyles2(getStyles);
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.messages]);

  const send = useCallback(async () => {
    const current = stateRef.current;
    const text = current.input.trim();
    if (!text || current.streaming) {
      return;
    }

    // Build the outgoing messages: prior turns + this user turn.
    const outgoing: Message[] = [...current.messages, { role: 'user', content: text }];
    dispatch({ type: 'send' });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(apiUrl(`/api/plugins/${pluginId}/resources/chat`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ messages: outgoing }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        let msg = `request failed (${resp.status})`;
        try {
          const j = await resp.json();
          if (j && j.error) {
            msg = j.error;
          }
        } catch (e) {
          // ignore parse error
        }
        dispatch({ type: 'error', value: msg });
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          dispatch({ type: 'appendDelta', value: chunk });
        }
      }
      dispatch({ type: 'done' });
    } catch (err: any) {
      if (err && err.name === 'AbortError') {
        dispatch({ type: 'done' });
      } else {
        dispatch({ type: 'error', value: err?.message || 'stream error' });
      }
    } finally {
      abortRef.current = null;
    }
  }, [pluginId]);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          <Icon name="comment-alt" /> Hermes Chat
        </h2>
        <Button variant="secondary" size="sm" icon="trash-alt" onClick={() => dispatch({ type: 'reset' })}>
          New chat
        </Button>
      </div>

      <div className={styles.messages} ref={scrollRef}>
        {state.messages.length === 0 && <div className={styles.empty}>Ask hermes anything to get started.</div>}
        {state.messages.map((m, i) => (
          <div key={i} className={cx(styles.bubbleRow, m.role === 'user' ? styles.rowUser : styles.rowAssistant)}>
            <div className={cx(styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant)}>
              {m.role === 'assistant' ? (
                <div
                  className={styles.markdown}
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(m.content || ''),
                  }}
                />
              ) : (
                <div className={styles.userText}>{m.content}</div>
              )}
              {m.role === 'assistant' && state.streaming && i === state.messages.length - 1 && (
                <span className={styles.cursor}>
                  <Spinner inline size={12} />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {state.error && <div className={styles.error}>{state.error}</div>}

      <div className={styles.inputBar}>
        <TextArea
          value={state.input}
          placeholder="Type a message. Enter to send, Shift+Enter for newline."
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            dispatch({
              type: 'setInput',
              value: e.target.value,
            })
          }
          onKeyDown={onKeyDown}
          rows={2}
        />
        {state.streaming ? (
          <Button variant="destructive" icon="square-shape" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button icon="message" onClick={send} disabled={!state.input.trim()}>
            Send
          </Button>
        )}
      </div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  page: css`
    display: flex;
    flex-direction: column;
    height: calc(100vh - 80px);
    padding: ${theme.spacing(2)};
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: ${theme.spacing(1)};
  `,
  title: css`
    margin: 0;
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
  `,
  messages: css`
    flex: 1;
    overflow-y: auto;
    padding: ${theme.spacing(1)};
    background: ${theme.colors.background.secondary};
    border-radius: ${theme.shape.borderRadius(1)};
  `,
  empty: css`
    color: ${theme.colors.text.secondary};
    text-align: center;
    margin-top: ${theme.spacing(4)};
  `,
  bubbleRow: css`
    display: flex;
    margin-bottom: ${theme.spacing(1.5)};
  `,
  rowUser: css`
    justify-content: flex-end;
  `,
  rowAssistant: css`
    justify-content: flex-start;
  `,
  bubble: css`
    max-width: 80%;
    padding: ${theme.spacing(1, 1.5)};
    border-radius: ${theme.shape.borderRadius(2)};
    word-break: break-word;
  `,
  bubbleUser: css`
    background: ${theme.colors.primary.main};
    color: ${theme.colors.primary.contrastText};
  `,
  bubbleAssistant: css`
    background: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.weak};
  `,
  userText: css`
    white-space: pre-wrap;
  `,
  markdown: css`
    p:last-child {
      margin-bottom: 0;
    }
    pre {
      background: ${theme.colors.background.secondary};
      padding: ${theme.spacing(1)};
      border-radius: ${theme.shape.borderRadius(1)};
      overflow-x: auto;
    }
    code {
      font-family: ${theme.typography.fontFamilyMonospace};
    }
  `,
  cursor: css`
    margin-left: ${theme.spacing(0.5)};
  `,
  error: css`
    color: ${theme.colors.error.text};
    margin: ${theme.spacing(1, 0)};
  `,
  inputBar: css`
    display: flex;
    align-items: flex-end;
    gap: ${theme.spacing(1)};
    margin-top: ${theme.spacing(1)};
  `,
});
