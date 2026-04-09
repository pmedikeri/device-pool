package main

import (
	"net"
	"os"
	"os/exec"
	"os/user"
	"runtime"
	"strconv"
	"strings"
)

// getHostname returns the system hostname.
func getHostname() string {
	h, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return h
}

// getLocalIP returns the first non-loopback IPv4 address.
func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "127.0.0.1"
}

// getOsType maps runtime.GOOS to the platform labels expected by the server.
func getOsType() string {
	switch runtime.GOOS {
	case "linux":
		return "linux"
	case "darwin":
		return "macos"
	case "windows":
		return "windows"
	default:
		return runtime.GOOS
	}
}

// getIdleSeconds returns the number of seconds the machine has been idle.
// On Linux it attempts to parse /proc/uptime as a rough proxy; on other
// platforms it returns 0 (stub).
func getIdleSeconds() int64 {
	if runtime.GOOS != "linux" {
		return 0 // stub: macOS/Windows not implemented
	}

	// Try xprintidle first (X11 idle time in milliseconds).
	if out, err := exec.Command("xprintidle").Output(); err == nil {
		ms, err := strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64)
		if err == nil {
			return ms / 1000
		}
	}

	// Fallback: parse /proc/uptime (second field is cumulative idle across CPUs).
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}
	fields := strings.Fields(string(data))
	if len(fields) < 2 {
		return 0
	}
	idle, err := strconv.ParseFloat(fields[1], 64)
	if err != nil {
		return 0
	}
	return int64(idle)
}

// getLocalUser returns the currently logged-in user.
// On Linux it parses `who` output; falls back to the process owner.
func getLocalUser() string {
	if runtime.GOOS == "linux" {
		if out, err := exec.Command("who").Output(); err == nil {
			lines := strings.Split(strings.TrimSpace(string(out)), "\n")
			if len(lines) > 0 && lines[0] != "" {
				fields := strings.Fields(lines[0])
				if len(fields) > 0 {
					return fields[0]
				}
			}
		}
	}

	// Fallback: process owner.
	if u, err := user.Current(); err == nil {
		return u.Username
	}
	return "unknown"
}

// isSessionActive checks whether a graphical (X11/Wayland) or console
// session is active. On Linux it looks for common session indicators.
// Stub on other platforms: returns false.
func isSessionActive() bool {
	if runtime.GOOS != "linux" {
		return false // stub: macOS/Windows not implemented
	}

	// Check for an active graphical session via DISPLAY or WAYLAND_DISPLAY.
	if os.Getenv("DISPLAY") != "" || os.Getenv("WAYLAND_DISPLAY") != "" {
		return true
	}

	// Check loginctl for active sessions.
	out, err := exec.Command("loginctl", "list-sessions", "--no-legend").Output()
	if err == nil && strings.TrimSpace(string(out)) != "" {
		return true
	}

	// Check who output.
	out, err = exec.Command("who").Output()
	if err == nil && strings.TrimSpace(string(out)) != "" {
		return true
	}

	return false
}
