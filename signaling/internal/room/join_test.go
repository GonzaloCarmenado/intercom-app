package room

import "testing"

func TestJoin_ValidCodeWithOneParticipant_Succeeds(t *testing.T) {
	m := NewManager()
	code, _, err := m.CreateRoom()
	if err != nil {
		t.Fatalf("CreateRoom() error = %v", err)
	}

	r, _, err := m.Join(code)
	if err != nil {
		t.Fatalf("Join(%q) error = %v", code, err)
	}
	if r.Code != code {
		t.Fatalf("Join(%q) returned room with code %q", code, r.Code)
	}
}

func TestJoin_UnknownCode_ReturnsNotFound(t *testing.T) {
	m := NewManager()

	_, _, err := m.Join("NOPE00")
	if err != ErrRoomNotFound {
		t.Fatalf("Join(unknown code) error = %v, want ErrRoomNotFound", err)
	}
}

func TestJoin_AlreadyFullRoom_ReturnsFull(t *testing.T) {
	m := NewManager()
	code, _, err := m.CreateRoom()
	if err != nil {
		t.Fatalf("CreateRoom() error = %v", err)
	}
	if _, _, err := m.Join(code); err != nil {
		t.Fatalf("first Join(%q) error = %v", code, err)
	}

	_, _, err = m.Join(code)
	if err != ErrRoomFull {
		t.Fatalf("second Join(%q) error = %v, want ErrRoomFull", code, err)
	}
}
