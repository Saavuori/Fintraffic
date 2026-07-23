package ais

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/prometheus/client_golang/prometheus"
	"fintraffic/internal/core/cache"
	"fintraffic/internal/meri/trail"
)

var (
	MessagesReceivedCounter = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "fintraffic_meri_mqtt_messages_received_total",
		Help: "Total number of MQTT messages received from the Digitraffic broker.",
	}, []string{"topic_type"})

	ParseErrorsCounter = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "fintraffic_meri_mqtt_parse_errors_total",
		Help: "Total number of MQTT messages that failed to unmarshal.",
	})
)

func init() {
	prometheus.MustRegister(MessagesReceivedCounter)
	prometheus.MustRegister(ParseErrorsCounter)
}

type IngestionWorker struct {
	client mqtt.Client
	cache  cache.Cache
	trail  *trail.Store // nil when trail recording is disabled; all uses are nil-safe
	broker string

	// meta and lastPos are shared between MQTT callbacks and hydration;
	// paho may run message handlers concurrently.
	mu      sync.Mutex
	meta    map[int]VesselMetadata
	lastPos map[int]VesselPosition
}

func NewIngestionWorker(broker string, cache cache.Cache) *IngestionWorker {
	return &IngestionWorker{
		broker:  broker,
		cache:   cache,
		meta:    make(map[int]VesselMetadata),
		lastPos: make(map[int]VesselPosition),
	}
}

// SetTrailStore attaches a trail store so location fixes are also recorded to
// history. Passing nil (or never calling this) leaves recording disabled.
func (w *IngestionWorker) SetTrailStore(s *trail.Store) {
	w.trail = s
}

func (w *IngestionWorker) Start(ctx context.Context) error {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(w.broker)
	opts.SetClientID(fmt.Sprintf("fintraffic-meri-%d", time.Now().UnixNano()))
	opts.SetCleanSession(true)
	opts.SetAutoReconnect(true)
	opts.SetConnectTimeout(10 * time.Second)
	opts.SetKeepAlive(30 * time.Second)
	opts.SetPingTimeout(10 * time.Second)

	opts.OnConnect = func(client mqtt.Client) {
		log.Println("MQTT connected to broker:", w.broker)
		// Wildcard covers location + metadata + the status topic Digitraffic
		// recommends subscribing to; dispatch happens on the topic suffix.
		token := client.Subscribe("vessels-v2/#", 0, w.handleMessage)
		if token.Wait() && token.Error() != nil {
			log.Printf("Failed to subscribe to vessels-v2/#: %v\n", token.Error())
		} else {
			log.Println("Successfully subscribed to vessels-v2/#")
		}
	}

	opts.OnConnectionLost = func(client mqtt.Client, err error) {
		log.Printf("MQTT connection lost: %v\n", err)
	}

	w.client = mqtt.NewClient(opts)

	if token := w.client.Connect(); token.Wait() && token.Error() != nil {
		return fmt.Errorf("failed to connect to MQTT broker: %w", token.Error())
	}

	return nil
}

func (w *IngestionWorker) IsConnected() bool {
	return w.client != nil && w.client.IsConnected()
}

func (w *IngestionWorker) Stop() {
	if w.client != nil && w.client.IsConnected() {
		w.client.Disconnect(250)
	}
}

func (w *IngestionWorker) handleMessage(client mqtt.Client, msg mqtt.Message) {
	// Topic: vessels-v2/<mmsi>/location | vessels-v2/<mmsi>/metadata | vessels-v2/status
	parts := strings.Split(msg.Topic(), "/")
	suffix := parts[len(parts)-1]

	switch suffix {
	case "location", "locations":
		MessagesReceivedCounter.WithLabelValues("location").Inc()
		if len(parts) < 3 {
			return
		}
		mmsi, err := strconv.Atoi(parts[1])
		if err != nil {
			return
		}
		w.handleLocation(mmsi, msg.Payload())
	case "metadata":
		MessagesReceivedCounter.WithLabelValues("metadata").Inc()
		if len(parts) < 3 {
			return
		}
		mmsi, err := strconv.Atoi(parts[1])
		if err != nil {
			return
		}
		w.handleMetadata(mmsi, msg.Payload())
	case "status":
		MessagesReceivedCounter.WithLabelValues("status").Inc()
	default:
		MessagesReceivedCounter.WithLabelValues("other").Inc()
	}
}

func (w *IngestionWorker) handleLocation(mmsi int, payload []byte) {
	var loc mqttLocation
	if err := json.Unmarshal(payload, &loc); err != nil {
		ParseErrorsCounter.Inc()
		log.Printf("Error unmarshaling location for %d: %v (raw: %s)\n", mmsi, err, string(payload))
		return
	}

	if !validCoords(loc.Lat, loc.Lon) {
		return
	}

	pos := VesselPosition{
		MMSI:    mmsi,
		Lat:     loc.Lat,
		Lng:     loc.Lon,
		Sog:     loc.Sog,
		Cog:     loc.Cog,
		NavStat: loc.NavStat,
		Rot:     loc.Rot,
		Ts:      loc.Time,
	}
	if loc.Heading >= 0 && loc.Heading < 360 {
		h := loc.Heading
		pos.Hdg = &h
	}
	// MQTT `time` is epoch seconds; guard against ms-scale values just in case.
	if pos.Ts > 1e12 {
		pos.Ts = pos.Ts / 1000
	}

	w.mu.Lock()
	if m, ok := w.meta[mmsi]; ok {
		pos.applyMeta(m)
	}
	w.lastPos[mmsi] = pos
	w.mu.Unlock()

	w.writePosition(pos)
	// Record to trail history (nil-safe, downsampled inside Add).
	w.trail.Add(pos.MMSI, pos.Ts, pos.Lat, pos.Lng, pos.Sog, pos.Cog)
}

func (w *IngestionWorker) handleMetadata(mmsi int, payload []byte) {
	var md mqttMetadata
	if err := json.Unmarshal(payload, &md); err != nil {
		ParseErrorsCounter.Inc()
		log.Printf("Error unmarshaling metadata for %d: %v (raw: %s)\n", mmsi, err, string(payload))
		return
	}

	m := md.toMetadata()

	w.mu.Lock()
	w.meta[mmsi] = m
	pos, hasPos := w.lastPos[mmsi]
	if hasPos {
		pos.applyMeta(m)
		w.lastPos[mmsi] = pos
	}
	w.mu.Unlock()

	// Re-write the merged record so names/types appear without waiting for the
	// next position fix.
	if hasPos {
		w.writePosition(pos)
	}
}

func (w *IngestionWorker) writePosition(pos VesselPosition) {
	data, err := json.Marshal(pos)
	if err != nil {
		log.Printf("Error marshaling position for %d: %v\n", pos.MMSI, err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := w.cache.SetPosition(ctx, strconv.Itoa(pos.MMSI), data); err != nil {
		log.Printf("Error caching position for %d: %v\n", pos.MMSI, err)
	}
}
