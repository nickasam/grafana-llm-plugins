package plugin

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// chatMessage is one turn in the conversation (OpenAI chat format).
type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatRequest is the body the frontend POSTs to /chat.
type chatRequest struct {
	Messages []chatMessage `json:"messages"`
	// SystemPrompt is an optional per-panel prompt. When present it overrides
	// the global prompt configured in the app settings.
	SystemPrompt string `json:"systemPrompt"`
}

// hermesRequest is the body we send to hermes-agent.
type hermesRequest struct {
	Model    string        `json:"model"`
	Stream   bool          `json:"stream"`
	Messages []chatMessage `json:"messages"`
}

// sseChunk is the minimal shape we decode from each SSE data line.
type sseChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}

// httpClient is used for all outbound hermes calls. Long timeout because a
// multi-skill analysis can take minutes.
var httpClient = &http.Client{Timeout: 10 * time.Minute}

// CallResource routes plugin resource requests. Implemented directly (not via
// httpadapter) so /chat can call sender.Send() repeatedly for streaming.
func (a *App) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	switch {
	case req.Path == "ping":
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusOK,
			Body:   []byte(`{"status":"ok"}`),
		})
	case req.Path == "chat" && req.Method == http.MethodPost:
		return a.handleChat(ctx, req, sender)
	default:
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusNotFound,
			Body:   []byte(`{"error":"not found"}`),
		})
	}
}

// handleChat proxies a chat request to hermes and streams deltas back.
func (a *App) handleChat(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	if a.cfg.URL == "" {
		return sendError(sender, http.StatusBadGateway, "hermes URL is not configured")
	}

	var body chatRequest
	if err := json.Unmarshal(req.Body, &body); err != nil {
		return sendError(sender, http.StatusBadRequest, "invalid request body")
	}

	// Per-panel prompt (from the request body) takes precedence over the
	// global prompt configured in app settings.
	systemPrompt := a.cfg.SystemPrompt
	if body.SystemPrompt != "" {
		systemPrompt = body.SystemPrompt
	}

	messages := make([]chatMessage, 0, len(body.Messages)+1)
	if systemPrompt != "" {
		messages = append(messages, chatMessage{Role: "system", Content: systemPrompt})
	}
	messages = append(messages, body.Messages...)

	hReq := hermesRequest{Model: a.cfg.Model, Stream: true, Messages: messages}
	payload, err := json.Marshal(hReq)
	if err != nil {
		return sendError(sender, http.StatusInternalServerError, "failed to encode request")
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.cfg.URL, bytes.NewReader(payload))
	if err != nil {
		return sendError(sender, http.StatusInternalServerError, "failed to build request")
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	if a.cfg.Token != "" {
		httpReq.Header.Set("Authorization", "Bearer "+a.cfg.Token)
	}

	resp, err := httpClient.Do(httpReq)
	if err != nil {
		log.DefaultLogger.Error("hermes request failed", "err", err)
		return sendError(sender, http.StatusBadGateway, "failed to reach hermes")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		log.DefaultLogger.Error("hermes returned non-200", "status", resp.StatusCode, "body", string(snippet))
		return sendError(sender, http.StatusBadGateway, fmt.Sprintf("hermes error: %d", resp.StatusCode))
	}

	// Send headers first so the browser starts a streaming response.
	if err := sender.Send(&backend.CallResourceResponse{
		Status: http.StatusOK,
		Headers: map[string][]string{
			"Content-Type":           {"text/plain; charset=utf-8"},
			"X-Content-Type-Options": {"nosniff"},
		},
	}); err != nil {
		return err
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		var chunk sseChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		delta := chunk.Choices[0].Delta.Content
		if delta == "" {
			continue
		}
		if err := sender.Send(&backend.CallResourceResponse{
			Status: http.StatusOK,
			Body:   []byte(delta),
		}); err != nil {
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		log.DefaultLogger.Error("error reading hermes stream", "err", err)
	}
	return nil
}

// sendError writes a single JSON error response.
func sendError(sender backend.CallResourceResponseSender, status int, msg string) error {
	b, _ := json.Marshal(map[string]string{"error": msg})
	return sender.Send(&backend.CallResourceResponse{Status: status, Body: b})
}
