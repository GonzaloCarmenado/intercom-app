package room

import (
	"testing"
	"time"
)

func TestJoin_ExpiredUnclaimedRoom_ReturnsNotFound(t *testing.T) {
	m := NewManagerWithTTL(20 * time.Millisecond)
	code, _, err := m.CreateRoom()
	if err != nil {
		t.Fatalf("CreateRoom() error = %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	_, _, err = m.Join(code)
	if err != ErrRoomNotFound {
		t.Fatalf("Join(expired code) error = %v, want ErrRoomNotFound", err)
	}
}

func TestJoin_ClaimedRoomOutlivesTTL(t *testing.T) {
	m := NewManagerWithTTL(20 * time.Millisecond)
	code, _, err := m.CreateRoom()
	if err != nil {
		t.Fatalf("CreateRoom() error = %v", err)
	}
	if _, _, err := m.Join(code); err != nil {
		t.Fatalf("Join(%q) error = %v", code, err)
	}

	time.Sleep(100 * time.Millisecond)

	if _, ok := m.rooms[code]; !ok {
		t.Fatal("claimed room was removed after its creation TTL elapsed")
	}
}
