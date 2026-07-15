package plugin

import (
	"encoding/json"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// hermesConfig holds the settings needed to talk to hermes-agent.
type hermesConfig struct {
	URL          string // e.g. http://hermes.easyalgo.jd.com:8643/v1/chat/completions
	Model        string // e.g. hermes-agent
	SystemPrompt string // optional platform prefix injected as first message
	Token        string // Bearer token, from secureJsonData (never logged)
}

// jsonDataFields mirrors the plugin's jsonData saved by the config page.
type jsonDataFields struct {
	URL          string `json:"url"`
	Model        string `json:"model"`
	SystemPrompt string `json:"systemPrompt"`
}

const defaultModel = "hermes-agent"

// loadConfig extracts hermesConfig from Grafana app instance settings.
func loadConfig(settings backend.AppInstanceSettings) (*hermesConfig, error) {
	var jd jsonDataFields
	if len(settings.JSONData) > 0 {
		if err := json.Unmarshal(settings.JSONData, &jd); err != nil {
			return nil, err
		}
	}

	model := jd.Model
	if model == "" {
		model = defaultModel
	}

	return &hermesConfig{
		URL:          jd.URL,
		Model:        model,
		SystemPrompt: jd.SystemPrompt,
		Token:        settings.DecryptedSecureJSONData["token"],
	}, nil
}
