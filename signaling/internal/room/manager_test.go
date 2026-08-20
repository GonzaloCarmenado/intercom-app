package room

import "testing"

func TestCreateRoom_ReturnsNonEmptyCode(t *testing.T) {
	m := NewManager()

	code, _, err := m.CreateRoom()
	if err != nil {
		t.Fatalf("CreateRoom() error = %v", err)
	}
	if code == "" {
		t.Fatal("CreateRoom() returned an empty code")
	}
}

func TestCreateRoom_CodesAreUnique(t *testing.T) {
	m := NewManager()
	seen := make(map[string]bool)

	for range 200 {
		code, _, err := m.CreateRoom()
		if err != nil {
			t.Fatalf("CreateRoom() error = %v", err)
		}
		if seen[code] {
			t.Fatalf("CreateRoom() produced a duplicate code %q", code)
		}
		seen[code] = true
	}
}
