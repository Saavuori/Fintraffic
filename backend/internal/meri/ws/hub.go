package ws

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/prometheus/client_golang/prometheus"
	"fintraffic/internal/core/cache"
)

var (
	ActiveClientsGauge = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "fintraffic_meri_active_websocket_clients",
		Help: "Number of active WebSocket clients connected to the hub.",
	})
)

func init() {
	prometheus.MustRegister(ActiveClientsGauge)
}

// resyncInterval: every N ticks all clients get a full snapshot as a safety
// valve against missed deltas.
const resyncInterval = 60

type Client struct {
	conn *websocket.Conn
	send chan []byte
}

type Hub struct {
	cache      cache.Cache
	clients    map[*Client]bool
	clientsMu  sync.RWMutex
	register   chan *Client
	unregister chan *Client

	// lastSent tracks the position timestamp last broadcast per MMSI; only
	// touched from Run's goroutine, no locking needed.
	lastSent map[string]int64
}

// StreamMessage is the wire format for both snapshots and deltas.
// A snapshot replaces the client's full vessel set; a delta contains only
// vessels whose position advanced plus MMSIs that went stale.
type StreamMessage struct {
	Type      string                     `json:"type"` // "snapshot" | "delta"
	Timestamp string                     `json:"timestamp"`
	Vessels   map[string]json.RawMessage `json:"vessels"`
	Removed   []string                   `json:"removed,omitempty"`
	Count     int                        `json:"count"` // total vessels currently known
}

func NewHub(c cache.Cache) *Hub {
	return &Hub{
		cache:      c,
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		lastSent:   make(map[string]int64),
	}
}

func (h *Hub) Run(ctx context.Context) {
	ticker := time.NewTicker(1000 * time.Millisecond)
	defer ticker.Stop()

	tickCount := 0

	for {
		select {
		case <-ctx.Done():
			return
		case client := <-h.register:
			h.clientsMu.Lock()
			h.clients[client] = true
			clientCount := len(h.clients)
			ActiveClientsGauge.Set(float64(clientCount))
			h.clientsMu.Unlock()
			h.sendSnapshotToClient(ctx, client, clientCount == 1)
		case client := <-h.unregister:
			h.clientsMu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			ActiveClientsGauge.Set(float64(len(h.clients)))
			h.clientsMu.Unlock()
		case <-ticker.C:
			tickCount++
			h.broadcast(ctx, tickCount%resyncInterval == 0)
		}
	}
}

// sendSnapshotToClient pushes a full snapshot to one newly registered client.
// When it is the only client, lastSent is rebased to the snapshot so the next
// delta doesn't replay everything accumulated while nobody was listening.
func (h *Hub) sendSnapshotToClient(ctx context.Context, client *Client, rebaseLastSent bool) {
	positions, err := h.cache.GetAllPositions(ctx)
	if err != nil {
		log.Printf("WS Hub error getting positions for snapshot: %v\n", err)
		return
	}

	payload, tsMap := buildMessage("snapshot", positions, nil, len(positions))
	if payload == nil {
		return
	}

	if rebaseLastSent {
		h.lastSent = tsMap
	}

	select {
	case client.send <- payload:
	default:
		log.Println("WS Hub: new client send channel full, skipping snapshot")
	}
}

func (h *Hub) broadcast(ctx context.Context, fullResync bool) {
	h.clientsMu.RLock()
	clientCount := len(h.clients)
	h.clientsMu.RUnlock()

	// If no clients connected, don't query the cache or serialize
	if clientCount == 0 {
		return
	}

	positions, err := h.cache.GetAllPositions(ctx)
	if err != nil {
		log.Printf("WS Hub error getting positions: %v\n", err)
		return
	}

	var payload []byte
	var tsMap map[string]int64

	if fullResync {
		payload, tsMap = buildMessage("snapshot", positions, nil, len(positions))
		if payload == nil {
			return
		}
		h.lastSent = tsMap
	} else {
		changed := make(map[string][]byte)
		tsMap = make(map[string]int64, len(positions))
		for mmsi, data := range positions {
			ts := extractTs(data)
			tsMap[mmsi] = ts
			if prev, ok := h.lastSent[mmsi]; !ok || ts > prev {
				changed[mmsi] = data
			}
		}

		var removed []string
		for mmsi := range h.lastSent {
			if _, ok := tsMap[mmsi]; !ok {
				removed = append(removed, mmsi)
			}
		}

		if len(changed) == 0 && len(removed) == 0 {
			return
		}

		msg, _ := buildMessage("delta", changed, removed, len(positions))
		if msg == nil {
			return
		}
		payload = msg
		h.lastSent = tsMap
	}

	h.clientsMu.RLock()
	defer h.clientsMu.RUnlock()

	for client := range h.clients {
		select {
		case client.send <- payload:
		default:
			log.Println("WS Hub: client send channel full, skipping client")
		}
	}
}

// buildMessage marshals a StreamMessage and returns it with a mmsi->ts map of
// the included vessels. totalCount is the full fleet size (for deltas it
// differs from the number of included vessels).
func buildMessage(msgType string, positions map[string][]byte, removed []string, totalCount int) ([]byte, map[string]int64) {
	vessels := make(map[string]json.RawMessage, len(positions))
	tsMap := make(map[string]int64, len(positions))
	for k, v := range positions {
		vessels[k] = json.RawMessage(v)
		tsMap[k] = extractTs(v)
	}

	msg := StreamMessage{
		Type:      msgType,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Vessels:   vessels,
		Removed:   removed,
		Count:     totalCount,
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		log.Printf("WS Hub error marshaling %s message: %v\n", msgType, err)
		return nil, nil
	}
	return payload, tsMap
}

func extractTs(data []byte) int64 {
	var p struct {
		Ts int64 `json:"ts"`
	}
	if err := json.Unmarshal(data, &p); err != nil {
		return 0
	}
	return p.Ts
}

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	opts := &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Allow cross-origin requests for the streaming API
		CompressionMode:    websocket.CompressionContextTakeover,
	}
	conn, err := websocket.Accept(w, r, opts)
	if err != nil {
		log.Printf("WS Accept error: %v\n", err)
		return
	}

	client := &Client{
		conn: conn,
		send: make(chan []byte, 16),
	}

	h.register <- client

	ctx, cancel := context.WithCancel(r.Context())
	defer func() {
		cancel()
		h.unregister <- client
		client.conn.Close(websocket.StatusGoingAway, "closing")
	}()

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-client.send:
				if !ok {
					return
				}
				writeCtx, writeCancel := context.WithTimeout(ctx, 3*time.Second)
				err := client.conn.Write(writeCtx, websocket.MessageText, msg)
				writeCancel()
				if err != nil {
					log.Printf("WS Write error: %v\n", err)
					return
				}
			}
		}
	}()

	// Read loop to detect disconnects / ping-pong
	for {
		_, _, err := conn.Read(r.Context())
		if err != nil {
			break
		}
	}
}
