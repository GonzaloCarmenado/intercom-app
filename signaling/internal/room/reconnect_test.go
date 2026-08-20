package room

import "testing"

func TestReconnect_ValidToken_Succeeds(t *testing.T) {
	m := NewManager()
	code, tokenA, err := m.CreateRoom()
	if err != nil {
		t.Fatalf("CreateRoom() error = %v", err)
	}
	if _, _, err := m.Join(code); err != nil {
		t.Fatalf("Join(%q) error = %v", code, err)
	}

	if _, err := m.Reconnect(code, tokenA); err != nil {
		t.Fatalf("Reconnect(%q, tokenA) error = %v", code, err)
	}
}

func TestReconnect_UnknownToken_ReturnsNotFound(t *testing.T) {
	m := NewManager()
	code, _, err := m.CreateRoom()
	if err != nil {
		t.Fatalf("CreateRoom() error = %v", err)
	}

	_, err = m.Reconnect(code, "not-a-real-token")
	if err != ErrRoomNotFound {
		t.Fatalf("Reconnect() error = %v, want ErrRoomNotFound", err)
	}
}

func TestClose_RemovesRoom(t *testing.T) {
	m := NewManager()
	code, _, err := m.CreateRoom()
	if err != nil {
		t.Fatalf("CreateRoom() error = %v", err)
	}

	m.Close(code)

	if _, _, err := m.Join(code); err != ErrRoomNotFound {
		t.Fatalf("Join(closed room) error = %v, want ErrRoomNotFound", err)
	}
}
