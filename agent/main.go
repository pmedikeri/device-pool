package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	serverURL := flag.String("server", "", "Device Pool platform URL (e.g. https://pool.example.com)")
	bootstrapToken := flag.String("token", "", "Bootstrap token for initial registration")
	configPath := flag.String("config", "/etc/devicepool/agent.json", "Path to agent config file")
	intervalSec := flag.Int("interval", 30, "Heartbeat interval in seconds")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("[devicepool-agent] ")

	// --- Registration flow ---
	if *bootstrapToken != "" {
		if *serverURL == "" {
			fmt.Fprintln(os.Stderr, "error: --server is required when --token is provided")
			os.Exit(1)
		}
		if err := Register(*serverURL, *bootstrapToken, *configPath); err != nil {
			fmt.Fprintf(os.Stderr, "registration failed: %v\n", err)
			os.Exit(1)
		}
	}

	// --- Load config ---
	cfg, err := LoadConfig(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error loading config from %s: %v\n", *configPath, err)
		fmt.Fprintln(os.Stderr, "hint: run with --server and --token to register first")
		os.Exit(1)
	}

	// Allow --server flag to override the config file value.
	if *serverURL != "" {
		cfg.ServerUrl = *serverURL
	}

	if cfg.ServerUrl == "" || cfg.DeviceId == "" || cfg.DeviceToken == "" {
		fmt.Fprintln(os.Stderr, "error: config is incomplete (need serverUrl, deviceId, deviceToken)")
		os.Exit(1)
	}

	log.Printf("Starting agent for device %s, heartbeat every %ds", cfg.DeviceId, *intervalSec)

	// --- Graceful shutdown ---
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		sig := <-sigCh
		log.Printf("Received signal %v, shutting down...", sig)
		cancel()
	}()

	// --- Heartbeat loop (blocks until ctx is cancelled) ---
	RunHeartbeatLoop(ctx, cfg, *intervalSec)

	log.Println("Agent stopped.")
}
