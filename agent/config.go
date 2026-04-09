package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// AgentConfig holds the persisted agent configuration.
type AgentConfig struct {
	ServerUrl   string `json:"serverUrl"`
	DeviceId    string `json:"deviceId"`
	DeviceToken string `json:"deviceToken"`
}

// LoadConfig reads the agent config from a JSON file.
func LoadConfig(path string) (*AgentConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}
	var cfg AgentConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	return &cfg, nil
}

// SaveConfig writes the agent config to a JSON file with 0600 permissions.
// It creates parent directories if they do not exist.
func SaveConfig(path string, cfg *AgentConfig) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return fmt.Errorf("create config dir %s: %w", dir, err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	data = append(data, '\n')

	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("write config %s: %w", path, err)
	}
	return nil
}
