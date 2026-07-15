package plugin

import (
	"context"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// App is the backend app instance. It proxies chat requests to hermes-agent
// and streams the SSE deltas back to the browser via repeated sender.Send().
type App struct {
	settings backend.AppInstanceSettings
	cfg      *hermesConfig
}

// NewApp creates a new app instance for the given settings. It is registered
// as the instance factory in main.go.
func NewApp(settings backend.AppInstanceSettings) (instancemgmt.Instance, error) {
	log.DefaultLogger.Info("creating hermeschat app instance")

	cfg, err := loadConfig(settings)
	if err != nil {
		return nil, err
	}

	return &App{settings: settings, cfg: cfg}, nil
}

// Dispose is called when the instance is discarded (e.g. settings changed).
func (a *App) Dispose() {}

// CheckHealth reports plugin health to Grafana.
func (a *App) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	if a.cfg.URL == "" {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: "hermes URL is not configured",
		}, nil
	}
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "hermeschat app is running",
	}, nil
}
