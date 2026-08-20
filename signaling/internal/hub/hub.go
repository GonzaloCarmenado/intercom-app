// Package hub conecta la señalización WebRTC (offer/answer/ICE) entre los
// dos móviles de una sala. El servidor nunca interpreta esos mensajes: solo
// los reenvía tal cual entre los dos WebSocket de la misma sala. También
// gestiona colgar explícito y reconexión tras una caída de red dentro de un
// margen de gracia (ver design.md del cambio).
package hub

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/GonzaloCarmenado/intercom-app/signaling/internal/room"
)

const (
	defaultMaxJoinAttemptsPerIP = 20
	defaultJoinAttemptWindow    = 5 * time.Minute
	defaultGraceWindow          = 60 * time.Second
)

// peerSlot es un participante ya emparejado o esperando emparejar, con su
// conexión activa y el token que demuestra que es el mismo participante en
// una reconexión.
type peerSlot struct {
	conn  *websocket.Conn
	token string
}

// activeRoom es una sala ya emparejada (los dos participantes se
// encontraron). peers solo contiene entradas para los tokens conectados
// ahora mismo: la ausencia de un token es "ese lado está desconectado,
// dentro (o fuera) de su margen de gracia".
type activeRoom struct {
	mu          sync.Mutex
	peers       map[string]*websocket.Conn
	graceTimers map[string]*time.Timer
}

// Hub sirve el endpoint WebSocket de señalización.
type Hub struct {
	rooms *room.Manager

	maxJoinAttemptsPerIP int
	joinAttemptWindow    time.Duration
	graceWindow          time.Duration

	mu            sync.Mutex
	pendingCreate map[string]peerSlot
	active        map[string]*activeRoom
	joinAttempts  map[string][]time.Time
}

// New crea un Hub que valida y gestiona salas a través de rooms.
func New(rooms *room.Manager) *Hub {
	return &Hub{
		rooms:                rooms,
		maxJoinAttemptsPerIP: defaultMaxJoinAttemptsPerIP,
		joinAttemptWindow:    defaultJoinAttemptWindow,
		graceWindow:          defaultGraceWindow,
		pendingCreate:        make(map[string]peerSlot),
		active:               make(map[string]*activeRoom),
		joinAttempts:         make(map[string][]time.Time),
	}
}

// ServeHTTP acepta la conexión WebSocket entrante:
//   - sin `code`: crea una sala nueva y espera al segundo participante.
//   - con `code` y sin `token`: se une a una sala existente como segundo
//     participante.
//   - con `code` y `token`: reconecta a una sala ya emparejada tras una
//     caída, dentro de su margen de gracia.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}

	code := r.URL.Query().Get("code")
	token := r.URL.Query().Get("token")

	if code == "" {
		h.handleCreate(context.Background(), conn)
		return
	}
	if token != "" {
		h.handleReconnect(context.Background(), conn, code, token)
		return
	}

	if !h.allowJoinAttempt(clientIP(r)) {
		writeAndClose(conn, "error", "rate_limited")
		return
	}
	h.handleJoin(context.Background(), conn, code)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (h *Hub) allowJoinAttempt(ip string) bool {
	now := time.Now()
	cutoff := now.Add(-h.joinAttemptWindow)

	h.mu.Lock()
	defer h.mu.Unlock()

	attempts := h.joinAttempts[ip]
	kept := attempts[:0]
	for _, t := range attempts {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= h.maxJoinAttemptsPerIP {
		h.joinAttempts[ip] = kept
		return false
	}
	h.joinAttempts[ip] = append(kept, now)
	return true
}

func (h *Hub) handleCreate(ctx context.Context, conn *websocket.Conn) {
	code, token, err := h.rooms.CreateRoom()
	if err != nil {
		writeAndClose(conn, "error", "internal")
		return
	}

	if err := wsjson.Write(ctx, conn, map[string]any{"type": "created", "code": code, "token": token}); err != nil {
		_ = conn.CloseNow()
		return
	}

	h.mu.Lock()
	h.pendingCreate[code] = peerSlot{conn: conn, token: token}
	h.mu.Unlock()
}

func (h *Hub) handleJoin(ctx context.Context, conn *websocket.Conn, code string) {
	_, tokenB, err := h.rooms.Join(code)
	if err != nil {
		reason := "not_found"
		if err == room.ErrRoomFull {
			reason = "full"
		}
		writeAndClose(conn, "error", reason)
		return
	}

	h.mu.Lock()
	creator, ok := h.pendingCreate[code]
	if ok {
		delete(h.pendingCreate, code)
	}
	h.mu.Unlock()

	if !ok {
		h.rooms.Close(code)
		writeAndClose(conn, "error", "not_found")
		return
	}

	ar := &activeRoom{
		peers:       map[string]*websocket.Conn{creator.token: creator.conn, tokenB: conn},
		graceTimers: make(map[string]*time.Timer),
	}
	h.mu.Lock()
	h.active[code] = ar
	h.mu.Unlock()

	if err := wsjson.Write(ctx, creator.conn, map[string]any{"type": "peer-joined"}); err != nil {
		return
	}
	if err := wsjson.Write(ctx, conn, map[string]any{"type": "peer-joined", "token": tokenB}); err != nil {
		return
	}

	go h.runPeerLoop(code, creator.token, creator.conn)
	h.runPeerLoop(code, tokenB, conn)
}

func (h *Hub) handleReconnect(ctx context.Context, conn *websocket.Conn, code, token string) {
	if _, err := h.rooms.Reconnect(code, token); err != nil {
		writeAndClose(conn, "error", "not_found")
		return
	}

	h.mu.Lock()
	ar, ok := h.active[code]
	h.mu.Unlock()
	if !ok {
		writeAndClose(conn, "error", "not_found")
		return
	}

	ar.mu.Lock()
	if timer, pending := ar.graceTimers[token]; pending {
		timer.Stop()
		delete(ar.graceTimers, token)
	}
	ar.peers[token] = conn
	otherConn := otherPeerConnLocked(ar, token)
	ar.mu.Unlock()

	if otherConn != nil {
		_ = wsjson.Write(ctx, otherConn, map[string]any{"type": "peer-reconnected"})
	}

	h.runPeerLoop(code, token, conn)
}

// runPeerLoop lee mensajes de conn hasta que se cierra o llega un hangup
// explícito, reenviando cualquier otro mensaje al otro lado de la sala.
func (h *Hub) runPeerLoop(code, token string, conn *websocket.Conn) {
	ctx := context.Background()
	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			h.onDisconnect(code, token)
			return
		}
		if typ == websocket.MessageText && isHangup(data) {
			h.onHangup(code)
			return
		}
		h.relay(code, token, typ, data)
	}
}

func isHangup(data []byte) bool {
	var probe struct {
		Type string `json:"type"`
	}
	return json.Unmarshal(data, &probe) == nil && probe.Type == "hangup"
}

func (h *Hub) relay(code, fromToken string, typ websocket.MessageType, data []byte) {
	h.mu.Lock()
	ar, ok := h.active[code]
	h.mu.Unlock()
	if !ok {
		return
	}

	ar.mu.Lock()
	toConn := otherPeerConnLocked(ar, fromToken)
	ar.mu.Unlock()

	if toConn != nil {
		_ = toConn.Write(context.Background(), typ, data)
	}
}

// onDisconnect marca a token como desconectado sin cerrar la sala todavía:
// avisa al otro lado y arma el margen de gracia para permitir reconexión.
func (h *Hub) onDisconnect(code, token string) {
	h.mu.Lock()
	ar, ok := h.active[code]
	h.mu.Unlock()
	if !ok {
		return
	}

	ar.mu.Lock()
	delete(ar.peers, token)
	otherConn := otherPeerConnLocked(ar, token)
	ar.graceTimers[token] = time.AfterFunc(h.graceWindow, func() { h.onGraceExpired(code, token) })
	ar.mu.Unlock()

	if otherConn != nil {
		_ = wsjson.Write(context.Background(), otherConn, map[string]any{"type": "reconnecting"})
	}
}

func (h *Hub) onGraceExpired(code, token string) {
	h.mu.Lock()
	ar, ok := h.active[code]
	h.mu.Unlock()
	if !ok {
		return
	}

	ar.mu.Lock()
	_, stillDisconnected := ar.graceTimers[token]
	if stillDisconnected {
		delete(ar.graceTimers, token)
	}
	ar.mu.Unlock()
	if !stillDisconnected {
		return // reconectó antes de que el timer disparara
	}

	h.closeRoom(code, "timeout")
}

// onHangup cierra la sala de inmediato: fin de llamada explícito.
func (h *Hub) onHangup(code string) {
	h.closeRoom(code, "hangup")
}

func (h *Hub) closeRoom(code, reason string) {
	h.mu.Lock()
	ar, ok := h.active[code]
	if ok {
		delete(h.active, code)
	}
	h.mu.Unlock()
	if !ok {
		return
	}

	h.rooms.Close(code)

	ar.mu.Lock()
	for _, timer := range ar.graceTimers {
		timer.Stop()
	}
	conns := make([]*websocket.Conn, 0, len(ar.peers))
	for _, c := range ar.peers {
		conns = append(conns, c)
	}
	ar.mu.Unlock()

	for _, c := range conns {
		_ = wsjson.Write(context.Background(), c, map[string]any{"type": "peer-left", "reason": reason})
		_ = c.CloseNow()
	}
}

// otherPeerConnLocked busca la conexión del participante distinto de token,
// asumiendo que el llamador ya tiene ar.mu bloqueado.
func otherPeerConnLocked(ar *activeRoom, token string) *websocket.Conn {
	for tok, c := range ar.peers {
		if tok != token {
			return c
		}
	}
	return nil
}

func writeAndClose(conn *websocket.Conn, msgType, reason string) {
	ctx := context.Background()
	_ = wsjson.Write(ctx, conn, map[string]any{"type": msgType, "reason": reason})
	_ = conn.CloseNow()
}
