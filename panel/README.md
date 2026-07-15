# Hermes Chat

A Grafana 8.5 app plugin that provides a streaming conversational interface backed by hermes-agent (OpenAI-compatible `/v1/chat/completions` + SSE).

## Features

- Full-page chat UI with multi-turn context maintained on the frontend.
- Go backend proxies requests to hermes-agent, hiding the API token and streaming SSE deltas back to the browser chunk by chunk.
- Admin settings page for hermes URL, model, bearer token (encrypted), and an optional system prompt.

## Configuration

Open the plugin **Settings** page (Admin) and set:

- **Hermes URL** — e.g. `http://hermes.easyalgo.jd.com:8643/v1/chat/completions`
- **Model** — defaults to `hermes-agent`
- **API token** — bearer token, stored encrypted in `secureJsonData`
- **System prompt** — optional prefix injected as the first message on every request

## Development

```
npm install
NODE_OPTIONS=--openssl-legacy-provider npx grafana-toolkit plugin:build
GOOS=linux GOARCH=amd64 go build -o dist/gpx_hermeschat_linux_amd64 ./pkg
```
