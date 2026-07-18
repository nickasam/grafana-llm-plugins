import React, { useState } from 'react';
import { AppPluginMeta, PluginConfigPageProps, GrafanaTheme2 } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { Button, Field, Input, TextArea, LegacyForms, useStyles2, Alert, Legend } from '@grafana/ui';

const { SecretFormField } = LegacyForms;
import { css } from '@emotion/css';
import { HermesJsonData } from '../types';

interface Props extends PluginConfigPageProps<AppPluginMeta<HermesJsonData>> {}

export const ConfigPage: React.FC<Props> = ({ plugin }) => {
  const styles = useStyles2(getStyles);
  const { enabled, pinned, jsonData, secureJsonFields } = plugin.meta as AppPluginMeta<HermesJsonData> & {
    enabled?: boolean;
    pinned?: boolean;
    secureJsonFields?: Record<string, boolean>;
  };

  const [url, setUrl] = useState(jsonData?.url ?? '');
  const [model, setModel] = useState(jsonData?.model ?? 'hermes-agent');
  const [systemPrompt, setSystemPrompt] = useState(jsonData?.systemPrompt ?? '');
  const [token, setToken] = useState('');
  const [tokenConfigured, setTokenConfigured] = useState(Boolean(secureJsonFields?.token));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);

    const body: any = {
      enabled: enabled ?? true,
      pinned: pinned ?? true,
      jsonData: { url, model, systemPrompt },
    };
    // Only send the token when the admin typed a new one.
    if (token) {
      body.secureJsonData = { token };
    }

    try {
      await getBackendSrv().post(`/api/plugins/${plugin.meta.id}/settings`, body);
      setSaved(true);
      if (token) {
        setTokenConfigured(true);
        setToken('');
      }
      // Reload so Grafana restarts the backend with new settings.
      window.location.reload();
    } catch (e: any) {
      setError(e?.data?.message || e?.statusText || 'failed to save settings');
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <Legend>Hermes connection</Legend>
      {saved && <Alert severity="success" title="Settings saved" />}
      {error && <Alert severity="error" title={error} />}

      <Field label="Hermes URL" description="OpenAI-compatible chat completions endpoint (SSE).">
        <Input
          width={70}
          value={url}
          placeholder="http://hermes.example.com:8643/v1/chat/completions"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
        />
      </Field>

      <Field label="Model">
        <Input
          width={40}
          value={model}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel(e.target.value)}
        />
      </Field>

      <Field
        label="API token"
        description="Bearer token sent to hermes. Stored encrypted, never exposed to the browser."
      >
        <SecretFormField
          label="Token"
          labelWidth={10}
          inputWidth={30}
          isConfigured={tokenConfigured}
          value={token}
          placeholder="Enter token"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
          onReset={() => {
            setToken('');
            setTokenConfigured(false);
          }}
        />
      </Field>

      <Field label="System prompt" description="Optional prefix injected as the first message on every request.">
        <TextArea
          rows={6}
          value={systemPrompt}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSystemPrompt(e.target.value)}
        />
      </Field>

      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    max-width: 800px;
    padding: ${theme.spacing(2)};
  `,
});
