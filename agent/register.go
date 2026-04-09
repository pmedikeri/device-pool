package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"runtime"
	"time"
)

// accessMethod describes one way to reach the device.
type accessMethod struct {
	Method string `json:"method"`
	Port   int    `json:"port"`
}

// registrationRequest is the payload sent to the enrollment endpoint.
type registrationRequest struct {
	Token         string         `json:"token"`
	Hostname      string         `json:"hostname"`
	OsType        string         `json:"osType"`
	Architecture  string         `json:"architecture"`
	IpAddress     string         `json:"ipAddress"`
	AccessMethods []accessMethod `json:"accessMethods"`
}

// registrationResponse is the expected reply from the server.
type registrationResponse struct {
	DeviceId    string `json:"deviceId"`
	DeviceToken string `json:"deviceToken"`
}

// Register performs the device registration flow. It POSTs enrollment data
// to the platform and, on success, writes the returned credentials to the
// config file.
func Register(serverUrl, bootstrapToken, configPath string) error {
	payload := registrationRequest{
		Token:        bootstrapToken,
		Hostname:     getHostname(),
		OsType:       getOsType(),
		Architecture: runtime.GOARCH,
		IpAddress:    getLocalIP(),
		AccessMethods: []accessMethod{
			{Method: "ssh", Port: 22},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal registration payload: %w", err)
	}

	url := serverUrl + "/api/enrollment/register"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("POST %s: %w", url, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("registration failed (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	var result registrationResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return fmt.Errorf("parse registration response: %w", err)
	}

	if result.DeviceId == "" || result.DeviceToken == "" {
		return fmt.Errorf("server returned empty deviceId or deviceToken")
	}

	cfg := &AgentConfig{
		ServerUrl:   serverUrl,
		DeviceId:    result.DeviceId,
		DeviceToken: result.DeviceToken,
	}
	if err := SaveConfig(configPath, cfg); err != nil {
		return fmt.Errorf("save config after registration: %w", err)
	}

	fmt.Printf("Registration successful. DeviceId=%s, config written to %s\n", result.DeviceId, configPath)
	return nil
}
