# syntax=docker/dockerfile:1

# Build estático (CGO_ENABLED=0): la etapa de runtime no necesita el
# toolchain de Go, solo el binario — mismo patrón que apps/api de
# moto-routes (ver su Dockerfile) para paridad operativa en el mismo
# servidor. Sin ca-certificates en el runtime: este servicio no hace
# ninguna llamada saliente HTTPS, solo acepta WebSocket entrante.

FROM golang:1.26-trixie AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -o /app/bin/signaling ./cmd/signaling

FROM debian:trixie-slim AS runtime

# Usuario no-root: el proceso solo escucha en :8090 (>1024) y no necesita
# ningún privilegio de superusuario.
RUN groupadd --system appuser && useradd --system --gid appuser --no-create-home appuser

WORKDIR /app
COPY --from=build /app/bin/signaling ./signaling
RUN chown -R appuser:appuser /app

USER appuser
EXPOSE 8090
ENTRYPOINT ["./signaling"]
