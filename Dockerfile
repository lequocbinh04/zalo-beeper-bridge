# Build stage
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache git gcc musl-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -tags nocrypto \
    -ldflags "-X main.Tag=v0.1.0 -X main.Commit=$(git rev-parse --short HEAD || echo unknown) -X main.BuildTime=$(date -u +%Y%m%d-%H%M%S)" \
    -o /app/mautrix-zalo ./cmd/mautrix-zalo

# Runtime stage
FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/mautrix-zalo /usr/bin/mautrix-zalo
USER nobody:nobody
VOLUME /data
WORKDIR /data
CMD ["mautrix-zalo"]
