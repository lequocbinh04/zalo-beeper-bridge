# Build stage
FROM golang:1.22-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build \
    -ldflags "-X main.Tag=$(git describe --tags 2>/dev/null || echo unknown) \
              -X main.Commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown) \
              -X 'main.BuildTime=$(date -u)'" \
    -o mautrix-zalo ./cmd/mautrix-zalo/

# Runtime stage
FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/mautrix-zalo /usr/bin/mautrix-zalo
USER nobody:nobody
VOLUME /data
WORKDIR /data
CMD ["mautrix-zalo"]
