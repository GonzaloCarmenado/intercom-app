package hub

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/GonzaloCarmenado/intercom-app/signaling/internal/room"
)

func TestHub_TooManyJoinAttemptsFromSameIP_ReturnsRateLimited(t *testing.T) {
	h := New(room.NewManager())
	h.maxJoinAttemptsPerIP = 2

	server := httptest.NewServer(h)
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Dos intentos fallidos (código inexistente) agotan el límite.
	for range 2 {
		conn := dial(t, ctx, wsURL+"?code=NOPE00")
		msg := readMessage(t, ctx, conn)
		if msg["reason"] != "not_found" {
			t.Fatalf("message = %v, want reason=not_found", msg)
		}
	}

	conn := dial(t, ctx, wsURL+"?code=NOPE00")
	msg := readMessage(t, ctx, conn)
	if msg["type"] != "error" || msg["reason"] != "rate_limited" {
		t.Fatalf("message = %v, want type=error reason=rate_limited", msg)
	}
}
