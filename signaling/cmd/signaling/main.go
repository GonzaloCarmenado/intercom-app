// Command signaling arranca el servicio de señalización WebRTC en el puerto
// indicado por la variable de entorno PORT (por defecto 8090).
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/GonzaloCarmenado/intercom-app/signaling/internal/hub"
	"github.com/GonzaloCarmenado/intercom-app/signaling/internal/room"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}

	h := hub.New(room.NewManager())
	mux := http.NewServeMux()
	mux.Handle("/ws", h)
	mux.HandleFunc("/ping", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	log.Printf("signaling escuchando en :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
