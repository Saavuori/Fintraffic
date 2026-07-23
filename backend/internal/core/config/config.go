package config

import (
	"bufio"
	"flag"
	"log"
	"os"
	"strconv"
	"strings"
)

// DigitrafficUserAgent identifies this app to Digitraffic per their API etiquette.
const DigitrafficUserAgent = "Saavuori/Fintraffic 1.0"

type Config struct {
	RedisURL   string
	MQTTBroker string
	Port       string
	NoRedis    bool

	// Trail history (vessel track persistence). Recording is disabled when
	// TrailDBPath is empty.
	TrailDBPath        string
	TrailRetentionDays int
	TrailIntervalSec   int64
}

// envInt reads an integer env var, falling back to def when unset or unparseable.
func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
		log.Printf("Invalid %s=%q, using default %d\n", key, v, def)
	}
	return def
}

// loadDotEnv tries to find and parse a .env file from common locations and sets env vars
func loadDotEnv() {
	paths := []string{".env", "../.env", "backend/.env", "../backend/.env"}
	var file *os.File
	for _, path := range paths {
		f, err := os.Open(path)
		if err == nil {
			file = f
			break
		}
	}
	if file == nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		if len(val) >= 2 && ((val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'')) {
			val = val[1 : len(val)-1]
		}
		if os.Getenv(key) == "" {
			os.Setenv(key, val)
			log.Printf("Set env: %s\n", key)
		}
	}
}

func LoadConfig() *Config {
	loadDotEnv()

	cfg := &Config{
		RedisURL:   os.Getenv("REDIS_URL"),
		MQTTBroker: os.Getenv("MQTT_BROKER"),
		Port:       os.Getenv("PORT"),
	}

	if cfg.RedisURL == "" {
		cfg.RedisURL = "redis://fintraffic-cache:6379"
	}
	if cfg.MQTTBroker == "" {
		cfg.MQTTBroker = "wss://meri.digitraffic.fi:443/mqtt"
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}

	// Trail defaults: 60-day retention, one point per minute per vessel, DB on
	// a mounted volume. Set TRAIL_DB_PATH="" to disable trail recording.
	cfg.TrailDBPath = "/data/trail.db"
	if v, ok := os.LookupEnv("TRAIL_DB_PATH"); ok {
		cfg.TrailDBPath = v
	}
	cfg.TrailRetentionDays = envInt("TRAIL_RETENTION_DAYS", 60)
	cfg.TrailIntervalSec = int64(envInt("TRAIL_INTERVAL_SEC", 60))

	fs := flag.NewFlagSet("fintraffic", flag.ContinueOnError)
	noRedisFlag := fs.Bool("no-redis", false, "Use in-memory map instead of Redis")

	var args []string
	for _, arg := range os.Args[1:] {
		if len(arg) < 6 || arg[:6] != "-test." {
			args = append(args, arg)
		}
	}
	_ = fs.Parse(args)

	cfg.NoRedis = *noRedisFlag
	if os.Getenv("NO_REDIS") == "true" {
		cfg.NoRedis = true
	}

	return cfg
}
