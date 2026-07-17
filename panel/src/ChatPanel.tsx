import React, { useReducer, useRef, useCallback, useEffect, useMemo } from 'react';
import { PanelProps, GrafanaTheme2, DataFrame, Field, LoadingState, renderMarkdown } from '@grafana/data';
import { config } from '@grafana/runtime';
import { Button, TextArea, useStyles2, Spinner } from '@grafana/ui';
import { css, cx } from '@emotion/css';
import { HermesPanelOptions, Message } from './types';

interface State {
  messages: Message[];
  input: string;
  streaming: boolean;
  error: string | null;
}

type Action =
  | { type: 'setInput'; value: string }
  | { type: 'send'; userContent: string }
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
          { role: 'user', content: action.userContent },
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

type Row = { [key: string]: any };

function readValue(field: Field, index: number): any {
  return field.values.get ? field.values.get(index) : (field.values as any)[index];
}

function formatValue(v: any): string {
  if (v === null || v === undefined) {
    return '';
  }
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function seriesToRows(series: DataFrame[], maxRows: number): Row[] {
  const out: Row[] = [];
  for (const frame of series) {
    for (let i = 0; i < frame.length; i++) {
      if (out.length >= maxRows) {
        return out;
      }
      const rec: Row = {};
      for (const f of frame.fields) {
        rec[f.name] = readValue(f, i);
      }
      // ES logs put the actual doc under `_source`; flatten it.
      if (rec._source && typeof rec._source === 'object') {
        const src = rec._source;
        for (const k of Object.keys(src)) {
          if (rec[k] === undefined) {
            rec[k] = src[k];
          }
        }
        delete rec._source;
      }
      out.push(rec);
    }
  }
  return out;
}

function serializeRows(rows: Row[]): string {
  if (rows.length === 0) {
    return '(无数据)';
  }
  const lines: string[] = [];
  rows.forEach((r, idx) => {
    lines.push(`# 文档 ${idx + 1}`);
    for (const k of Object.keys(r)) {
      lines.push(`- ${k}: ${formatValue(r[k])}`);
    }
  });
  return lines.join('\n');
}

function hashRows(rows: Row[]): string {
  if (rows.length === 0) {
    return '';
  }
  const s = JSON.stringify(rows);
  // simple djb2 hash — good enough to detect content changes across refreshes
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `${rows.length}:${s.length}:${h}`;
}

// Prefix API paths with Grafana's appSubUrl so requests work when Grafana is
// mounted under a subpath (e.g. /grafana behind an Ingress).
function apiUrl(path: string): string {
  const base = (config.appSubUrl || '').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : '/' + path}`;
}

// Persist the conversation across remounts (row collapse/expand, panel resize,
// dashboard tab switch). Scoped to (dashboard, panel) within the current tab.
function messagesKey(dashUid: string, panelId: number | string): string {
  return `hermeschat:messages:${dashUid}:${panelId}`;
}

function readMessages(key: string): Message[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMessages(key: string, messages: Message[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(key, JSON.stringify(messages));
  } catch {
    // storage full or disabled — drop silently.
  }
}

function clearMessages(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const ChatPanel: React.FC<PanelProps<HermesPanelOptions>> = ({ id, options, data, width, height }) => {
  const styles = useStyles2(getStyles);
  const dashUid = (data?.request as any)?.dashboardUID || 'nodash';
  const msgKey = useMemo(() => messagesKey(dashUid, id), [dashUid, id]);
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...initialState,
    messages: readMessages(messagesKey(dashUid, id)),
  }));
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const autoFiredHashRef = useRef<string | null>(null);

  const appId = options.appId || 'easyalgo-hermeschat-app';
  const maxRows = options.maxRows && options.maxRows > 0 ? options.maxRows : 20;
  const autoSummaryEnabled = options.autoSummary !== false;
  const autoSummaryPrompt =
    options.autoSummaryPrompt || '请基于以上 ES 数据，给出结构化摘要（任务/时间线/根本原因/影响范围/建议），结论优先。';

  const series = useMemo(() => data?.series ?? [], [data]);
  const rows = useMemo(() => seriesToRows(series, maxRows), [series, maxRows]);
  const rowsHash = useMemo(() => hashRows(rows), [rows]);
  const loading = data?.state === LoadingState.Loading;
  const queryError = data?.state === LoadingState.Error ? data?.error?.message || 'query error' : null;
  const done = data?.state === LoadingState.Done;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.messages]);

  // Persist messages after each stream settles so a remount (row collapse/expand,
  // panel resize) can restore them. Skip while streaming to avoid thrashing storage.
  useEffect(() => {
    if (state.streaming) {
      return;
    }
    if (state.messages.length === 0) {
      clearMessages(msgKey);
    } else {
      writeMessages(msgKey, state.messages);
    }
  }, [state.messages, state.streaming, msgKey]);

  // When the user hits "New chat" we clear the fired hash so the next data tick can auto-summarize again.
  useEffect(() => {
    if (state.messages.length === 0 && !state.streaming) {
      autoFiredHashRef.current = null;
    }
  }, [state.messages.length, state.streaming]);

  const runStream = useCallback(
    async (outgoing: Message[]) => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const resp = await fetch(apiUrl(`/api/plugins/${appId}/resources/chat`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ messages: outgoing, systemPrompt: options.systemPrompt || undefined }),
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
          const { done: streamDone, value } = await reader.read();
          if (streamDone) {
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
    },
    [appId, options.systemPrompt]
  );

  const send = useCallback(async () => {
    const current = stateRef.current;
    const text = current.input.trim();
    if (!text || current.streaming) {
      return;
    }
    const outgoing: Message[] = [...current.messages, { role: 'user', content: text }];
    dispatch({ type: 'send', userContent: text });
    await runStream(outgoing);
  }, [runStream]);

  // Auto-fire a summary request whenever a fresh non-empty dataset lands and the chat is untouched.
  useEffect(() => {
    if (!autoSummaryEnabled) {
      return;
    }
    if (!done) {
      return;
    }
    if (rows.length === 0) {
      return;
    }
    if (state.messages.length > 0 || state.streaming) {
      return;
    }
    if (autoFiredHashRef.current === rowsHash) {
      return;
    }
    autoFiredHashRef.current = rowsHash;
    const userContent = `${autoSummaryPrompt}\n\n以下是查询结果：\n${serializeRows(rows)}`;
    const outgoing: Message[] = [{ role: 'user', content: userContent }];
    dispatch({ type: 'send', userContent });
    runStream(outgoing);
  }, [autoSummaryEnabled, done, rows, rowsHash, state.messages.length, state.streaming, autoSummaryPrompt, runStream]);

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

  const emptyState = (() => {
    if (loading) {
      return (
        <div className={styles.empty}>
          <Spinner inline size={12} /> 正在查询…
        </div>
      );
    }
    if (queryError) {
      return <div className={cx(styles.empty, styles.errorInline)}>查询错误：{queryError}</div>;
    }
    if (done && rows.length === 0) {
      return <div className={styles.empty}>当前 query 没有查询到结果。</div>;
    }
    return <div className={styles.empty}>等待数据…</div>;
  })();

  return (
    <div className={styles.panel} style={{ width, height }}>
      <div className={styles.messages} ref={scrollRef}>
        {state.messages.length === 0 && emptyState}
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
          placeholder={options.placeholder}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            dispatch({ type: 'setInput', value: e.target.value })
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
        <Button variant="secondary" icon="trash-alt" onClick={() => dispatch({ type: 'reset' })} title="New chat" />
      </div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  panel: css`
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
  `,
  messages: css`
    flex: 1;
    overflow-y: auto;
    padding: ${theme.spacing(1)};
  `,
  empty: css`
    color: ${theme.colors.text.secondary};
    text-align: center;
    margin-top: ${theme.spacing(4)};
  `,
  errorInline: css`
    color: ${theme.colors.error.text};
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
    min-width: 0;
    padding: ${theme.spacing(1, 1.5)};
    border-radius: ${theme.shape.borderRadius(2)};
    word-break: break-word;
    overflow-wrap: anywhere;
  `,
  bubbleUser: css`
    background: ${theme.colors.primary.main};
    color: ${theme.colors.primary.contrastText};
  `,
  bubbleAssistant: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
  `,
  userText: css`
    white-space: pre-wrap;
  `,
  markdown: css`
    overflow-wrap: anywhere;
    word-break: break-word;
    font-size: ${theme.typography.body.fontSize};
    line-height: ${theme.typography.body.lineHeight};
    p {
      margin: 0 0 ${theme.spacing(0.75)} 0;
    }
    p:last-child {
      margin-bottom: 0;
    }
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: ${theme.spacing(1)} 0 ${theme.spacing(0.5)} 0;
      line-height: 1.3;
      font-weight: 600;
    }
    h1 {
      font-size: ${theme.typography.h5.fontSize};
    }
    h2 {
      font-size: ${theme.typography.h6.fontSize};
    }
    h3,
    h4,
    h5,
    h6 {
      font-size: ${theme.typography.body.fontSize};
    }
    ul,
    ol {
      padding-left: ${theme.spacing(2.5)};
      margin: 0 0 ${theme.spacing(0.75)} 0;
    }
    li {
      overflow-wrap: anywhere;
    }
    pre {
      background: ${theme.colors.background.primary};
      padding: ${theme.spacing(1)};
      border-radius: ${theme.shape.borderRadius(1)};
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    code {
      font-family: ${theme.typography.fontFamilyMonospace};
      overflow-wrap: anywhere;
      word-break: break-all;
      white-space: pre-wrap;
    }
    table {
      display: block;
      max-width: 100%;
      overflow-x: auto;
      border-collapse: collapse;
      margin: ${theme.spacing(0.5)} 0 ${theme.spacing(1)} 0;
    }
    th,
    td {
      border: 1px solid ${theme.colors.border.weak};
      padding: ${theme.spacing(0.5, 1)};
      text-align: left;
      vertical-align: top;
    }
    th {
      background: ${theme.colors.background.primary};
      font-weight: 600;
    }
    blockquote {
      margin: ${theme.spacing(0.5)} 0;
      padding-left: ${theme.spacing(1)};
      border-left: 3px solid ${theme.colors.border.medium};
      color: ${theme.colors.text.secondary};
    }
  `,
  cursor: css`
    margin-left: ${theme.spacing(0.5)};
  `,
  error: css`
    color: ${theme.colors.error.text};
    padding: ${theme.spacing(0, 1)};
  `,
  inputBar: css`
    display: flex;
    align-items: flex-end;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(1)};
    border-top: 1px solid ${theme.colors.border.weak};
  `,
});
