package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"runtime"
	"time"
)

// heartbeatPayload is the body sent with each heartbeat POST.
type heartbeatPayload struct {
	Hostname      string `json:"hostname"`
	OsInfo        string `json:"osInfo"`
	LocalUser     string `json:"localUser"`
	IdleSeconds   int64  `json:"idleSeconds"`
	SessionActive bool   `json:"sessionActive"`
}

// RunHeartbeatLoop sends heartbeats at the given interval until the context
// is cancelled. Errors are logged but do not stop the loop.
func RunHeartbeatLoop(ctx context.Context, cfg *AgentConfig, intervalSec int) {
	ticker := time.NewTicker(time.Duration(intervalSec) * time.Second)
	defer ticker.Stop()

	// Send one heartbeat immediately on startup.
	sendHeartbeat(cfg)

	for {
		select {
		case <-ctx.Done():
			log.Println("Heartbeat loop stopped.")
			return
		case <-ticker.C:
			sendHeartbeat(cfg)
		}
	}
}

func sendHeartbeat(cfg *AgentConfig) {
	payload := heartbeatPayload{
		Hostname:      getHostname(),
		OsInfo:        fmt.Sprintf("%s %s", runtime.GOOS, runtime.GOARCH),
		LocalUser:     getLocalUser(),
		IdleSeconds:   getIdleSeconds(),
		SessionActive: isSessionActive(),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("heartbeat: marshal error: %v", err)
		return
	}

	url := fmt.Sprintf("%s/api/devices/%s/heartbeat", cfg.ServerUrl, cfg.DeviceId)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		log.Printf("heartbeat: create request error: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Device-Token", cfg.DeviceToken)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("heartbeat: POST %s error: %v", url, err)
		return
	}
	defer resp.Body.Close()

	// Drain the body so the connection can be reused.
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("heartbeat: server returned HTTP %d", resp.StatusCode)
		return
	}

	log.Printf("heartbeat: OK (HTTP %d)", resp.StatusCode)
}
