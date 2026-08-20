package hub

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/GonzaloCarmenado/intercom-app/signaling/internal/room"
)

func dial(t *testing.T, ctx context.Context, url string) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("websocket.Dial(%q) error = %v", url, err)
	}
	t.Cleanup(func() { _ = conn.Close(websocket.StatusNormalClosure, "") })
	return conn
}

func readMessage(t *testing.T, ctx context.Context, conn *websocket.Conn) map[string]any {
	t.Helper()
	var msg map[string]any
	if err := wsjson.Read(ctx, conn, &msg); err != nil {
		t.Fatalf("wsjson.Read() error = %v", err)
	}
	return msg
}

func TestHub_JoinConnectsBothSidesAndRelaysMessages(t *testing.T) {
	server := httptest.NewServer(New(room.NewManager()))
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	connA := dial(t, ctx, wsURL)
	created := readMessage(t, ctx, connA)
	if created["type"] != "created" {
		t.Fatalf("first message type = %v, want %q", created["type"], "created")
	}
	code, _ := created["code"].(string)
	if code == "" {
		t.Fatal("created message did not include a room code")
	}

	connB := dial(t, ctx, wsURL+"?code="+code)

	joinedA := readMessage(t, ctx, connA)
	if joinedA["type"] != "peer-joined" {
		t.Fatalf("peer A message type = %v, want %q", joinedA["type"], "peer-joined")
	}
	joinedB := readMessage(t, ctx, connB)
	if joinedB["type"] != "peer-joined" {
		t.Fatalf("peer B message type = %v, want %q", joinedB["type"], "peer-joined")
	}

	offer := map[string]any{"type": "offer", "sdp": "fake-sdp"}
	if err := wsjson.Write(ctx, connA, offer); err != nil {
		t.Fatalf("wsjson.Write(offer) error = %v", err)
	}

	relayed := readMessage(t, ctx, connB)
	relayedJSON, _ := json.Marshal(relayed)
	offerJSON, _ := json.Marshal(offer)
	if string(relayedJSON) != string(offerJSON) {
		t.Fatalf("relayed message = %s, want %s", relayedJSON, offerJSON)
	}
}

func TestHub_JoinUnknownCode_ReturnsNotFoundError(t *testing.T) {
	server := httptest.NewServer(New(room.NewManager()))
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn := dial(t, ctx, wsURL+"?code=NOPE00")
	msg := readMessage(t, ctx, conn)
	if msg["type"] != "error" || msg["reason"] != "not_found" {
		t.Fatalf("message = %v, want type=error reason=not_found", msg)
	}
}

func TestHub_JoinFullRoom_ReturnsFullError(t *testing.T) {
	server := httptest.NewServer(New(room.NewManager()))
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	connA := dial(t, ctx, wsURL)
	created := readMessage(t, ctx, connA)
	code, _ := created["code"].(string)

	connB := dial(t, ctx, wsURL+"?code="+code)
	readMessage(t, ctx, connA) // peer-joined
	readMessage(t, ctx, connB) // peer-joined

	connC := dial(t, ctx, wsURL+"?code="+code)
	msg := readMessage(t, ctx, connC)
	if msg["type"] != "error" || msg["reason"] != "full" {
		t.Fatalf("message = %v, want type=error reason=full", msg)
	}
}
