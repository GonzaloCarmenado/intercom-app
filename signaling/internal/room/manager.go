// Package room gestiona el ciclo de vida de las salas de señalización:
// creación, unión, reconexión, expiración y cierre. Sin persistencia — todo
// en memoria.
package room

import (
	"crypto/rand"
	"errors"
	"slices"
	"sync"
	"time"
)

// defaultRoomTTL es cuánto tiempo un código sigue siendo válido si nadie se
// une como segundo participante (ver design.md del cambio).
const defaultRoomTTL = 5 * time.Minute

// codeAlphabet evita caracteres ambiguos al teclear (0/O, 1/I/l).
const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

const codeLength = 6

// tokenLength es mayor que codeLength: el token nunca se teclea a mano, solo
// lo maneja la app para demostrar "soy el mismo participante de antes" al
// reconectar — no hace falta que sea corto.
const tokenLength = 24

// maxParticipants es piloto + copiloto — nunca más de dos personas por sala.
const maxParticipants = 2

// ErrRoomNotFound se devuelve cuando el código (o el token de reconexión) no
// corresponde a ninguna sala/participante activo.
var ErrRoomNotFound = errors.New("room not found")

// ErrRoomFull se devuelve cuando la sala ya tiene el máximo de participantes.
var ErrRoomFull = errors.New("room full")

// Room es una sala de señalización identificada por su código.
type Room struct {
	Code         string
	Participants int

	// tokens identifica a cada participante ya emparejado, para poder
	// reconectar sin confundir "el mismo peer" con un desconocido que
	// adivinó el código durante el margen de gracia de reconexión.
	tokens []string
}

// Manager mantiene las salas activas en memoria.
type Manager struct {
	roomTTL time.Duration

	mu    sync.Mutex
	rooms map[string]*Room
}

// NewManager crea un Manager vacío, sin salas, con el TTL de sala por defecto.
func NewManager() *Manager {
	return NewManagerWithTTL(defaultRoomTTL)
}

// NewManagerWithTTL crea un Manager con un TTL de sala concreto — pensado
// para tests que no pueden esperar defaultRoomTTL.
func NewManagerWithTTL(ttl time.Duration) *Manager {
	return &Manager{roomTTL: ttl, rooms: make(map[string]*Room)}
}

// CreateRoom genera un código de sala aleatorio y no adivinable, la registra
// en memoria y devuelve también el token de reconexión del creador.
func (m *Manager) CreateRoom() (code string, token string, err error) {
	code, err = generateRandomString(codeAlphabet, codeLength)
	if err != nil {
		return "", "", err
	}
	token, err = generateRandomString(codeAlphabet, tokenLength)
	if err != nil {
		return "", "", err
	}

	m.mu.Lock()
	m.rooms[code] = &Room{Code: code, Participants: 1, tokens: []string{token}}
	m.mu.Unlock()

	time.AfterFunc(m.roomTTL, func() { m.expireIfUnclaimed(code) })

	return code, token, nil
}

// expireIfUnclaimed elimina la sala si nadie se ha unido como segundo
// participante todavía. Una sala ya emparejada vive mientras dure la
// llamada, sin límite de tiempo por este mecanismo.
func (m *Manager) expireIfUnclaimed(code string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if r, ok := m.rooms[code]; ok && r.Participants < maxParticipants {
		delete(m.rooms, code)
	}
}

// Join añade un participante a la sala identificada por code y devuelve su
// token de reconexión. Devuelve ErrRoomNotFound si el código no existe (o ha
// caducado) y ErrRoomFull si ya tiene el máximo de participantes.
func (m *Manager) Join(code string) (room *Room, token string, err error) {
	token, err = generateRandomString(codeAlphabet, tokenLength)
	if err != nil {
		return nil, "", err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	r, ok := m.rooms[code]
	if !ok {
		return nil, "", ErrRoomNotFound
	}
	if r.Participants >= maxParticipants {
		return nil, "", ErrRoomFull
	}
	r.Participants++
	r.tokens = append(r.tokens, token)

	return r, token, nil
}

// Reconnect valida que token pertenece a un participante ya emparejado en la
// sala code, permitiendo retomar la señalización sin que un desconocido que
// adivinó el código pueda hacerse pasar por el peer original.
func (m *Manager) Reconnect(code, token string) (*Room, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	r, ok := m.rooms[code]
	if !ok || !slices.Contains(r.tokens, token) {
		return nil, ErrRoomNotFound
	}
	return r, nil
}

// Close elimina la sala code por completo — fin de llamada explícito o
// margen de gracia de reconexión agotado.
func (m *Manager) Close(code string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rooms, code)
}

func generateRandomString(alphabet string, length int) (string, error) {
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, length)
	for i, b := range buf {
		out[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(out), nil
}
