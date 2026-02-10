package connector

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// SidecarEvent is the WebSocket envelope from the sidecar.
type SidecarEvent struct {
	Type      string          `json:"type"`
	Data      json.RawMessage `json:"data"`
	Timestamp int64           `json:"timestamp"`
}

// connectWS dials the sidecar WebSocket endpoint.
func (c *ZaloClient) connectWS(ctx context.Context) error {
	wsURL := strings.Replace(c.sidecar.baseURL, "http", "ws", 1) + "/ws"
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return err
	}
	c.wsMu.Lock()
	c.wsConn = conn
	c.wsMu.Unlock()
	return nil
}

// wsReadLoop reads events from sidecar WS and dispatches them.
func (c *ZaloClient) wsReadLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		c.wsMu.Lock()
		conn := c.wsConn
		c.wsMu.Unlock()
		if conn == nil {
			return
		}

		_, msg, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			c.log.Err(err).Msg("WebSocket read error")
			c.handleWSReconnect(ctx)
			return
		}

		var evt SidecarEvent
		if err := json.Unmarshal(msg, &evt); err != nil {
			c.log.Err(err).Msg("Failed to parse sidecar event")
			continue
		}

		c.handleSidecarEvent(ctx, &evt)
	}
}

// handleSidecarEvent routes events by type.
func (c *ZaloClient) handleSidecarEvent(ctx context.Context, evt *SidecarEvent) {
	switch evt.Type {
	case "message":
		c.handleMessageEvent(ctx, evt.Data)
	case "reaction":
		c.handleReactionEvent(ctx, evt.Data)
	case "undo":
		c.handleUndoEvent(ctx, evt.Data)
	case "group_event":
		c.log.Debug().RawJSON("data", evt.Data).Msg("[DISCOVERY] Group event received")
	default:
		c.log.Warn().Str("type", evt.Type).Msg("Unknown sidecar event type")
	}
}

// handleWSReconnect attempts to reconnect with exponential backoff.
func (c *ZaloClient) handleWSReconnect(ctx context.Context) {
	backoff := time.Second
	for attempt := 0; attempt < 10; attempt++ {
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}

		c.log.Info().Int("attempt", attempt+1).Msg("Attempting WebSocket reconnect")
		if err := c.connectWS(ctx); err == nil {
			c.log.Info().Msg("WebSocket reconnected")
			go c.wsReadLoop(ctx)
			return
		}

		backoff = min(backoff*2, 30*time.Second)
	}
	c.log.Error().Msg("WebSocket reconnect failed after 10 attempts")
	c.loggedIn = false
}
