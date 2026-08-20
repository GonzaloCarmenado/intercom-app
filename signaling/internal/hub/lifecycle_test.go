package hub

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/GonzaloCarmenado/intercom-app/signaling/internal/room"
)

func pairedRoom(t *testing.T, ctx context.Context, wsURL string) (connA, connB *websocket.Conn, code, tokenB string) {
	t.Helper()

	connA = dial(t, ctx, wsURL)
	created := readMessage(t, ctx, connA)
	code, _ = created["code"].(string)

	connB = dial(t, ctx, wsURL+"?code="+code)
	readMessage(t, ctx, connA) // peer-joined (A)
	joinedB := readMessage(t, ctx, connB)
	tokenB, _ = joinedB["token"].(string)

	return connA, connB, code, tokenB
}

func TestHub_ExplicitHangup_ClosesRoomAndNotifiesOtherPeer(t *testing.T) {
	h := New(room.NewManager())
	server := httptest.NewServer(h)
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	connA, connB, code, _ := pairedRoom(t, ctx, wsURL)

	if err := wsjson.Write(ctx, connA, map[string]any{"type": "hangup"}); err != nil {
		t.Fatalf("wsjson.Write(hangup) error = %v", err)
	}

	msg := readMessage(t, ctx, connB)
	if msg["type"] != "peer-left" || msg["reason"] != "hangup" {
		t.Fatalf("message = %v, want type=peer-left reason=hangup", msg)
	}

	// El código ya no debe ser válido tras el hangup.
	connC := dial(t, ctx, wsURL+"?code="+code)
	err := readMessage(t, ctx, connC)
	if err["type"] != "error" || err["reason"] != "not_found" {
		t.Fatalf("message = %v, want type=error reason=not_found", err)
	}
}

func TestHub_AbruptDisconnectThenReconnect_ResumesRelay(t *testing.T) {
	h := New(room.NewManager())
	h.graceWindow = 2 * time.Second
	server := httptest.NewServer(h)
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	connA, connB, code, tokenB := pairedRoom(t, ctx, wsURL)

	// B se cae de golpe (sin hangup) - A debe recibir aviso de reconexión.
	_ = connB.Close(websocket.StatusAbnormalClosure, "")
	reconnecting := readMessage(t, ctx, connA)
	if reconnecting["type"] != "reconnecting" {
		t.Fatalf("message = %v, want type=reconnecting", reconnecting)
	}

	// B reconecta con su token dentro del margen de gracia.
	connB2 := dial(t, ctx, wsURL+"?code="+code+"&token="+tokenB)
	reconnected := readMessage(t, ctx, connA)
	if reconnected["type"] != "peer-reconnected" {
		t.Fatalf("message = %v, want type=peer-reconnected", reconnected)
	}

	offer := map[string]any{"type": "offer", "sdp": "resumed"}
	if err := wsjson.Write(ctx, connA, offer); err != nil {
		t.Fatalf("wsjson.Write(offer) error = %v", err)
	}
	relayed := readMessage(t, ctx, connB2)
	if relayed["sdp"] != "resumed" {
		t.Fatalf("relayed = %v, want sdp=resumed", relayed)
	}
}

func TestHub_AbruptDisconnectWithoutReconnect_ClosesRoomAfterGrace(t *testing.T) {
	h := New(room.NewManager())
	h.graceWindow = 50 * time.Millisecond
	server := httptest.NewServer(h)
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	connA, connB, code, _ := pairedRoom(t, ctx, wsURL)

	_ = connB.Close(websocket.StatusAbnormalClosure, "")
	readMessage(t, ctx, connA) // reconnecting

	timeout := readMessage(t, ctx, connA)
	if timeout["type"] != "peer-left" || timeout["reason"] != "timeout" {
		t.Fatalf("message = %v, want type=peer-left reason=timeout", timeout)
	}

	connC := dial(t, ctx, wsURL+"?code="+code)
	err := readMessage(t, ctx, connC)
	if err["type"] != "error" || err["reason"] != "not_found" {
		t.Fatalf("message = %v, want type=error reason=not_found (room closed after grace)", err)
	}
}
