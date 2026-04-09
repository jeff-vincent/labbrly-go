# Build context: labbrly-go/ (workspace root)
# docker build -f garbage-collection/Dockerfile .
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

COPY shared/go.mod shared/go.sum ./shared/
COPY garbage-collection/go.mod garbage-collection/go.sum ./garbage-collection/
WORKDIR /workspace/garbage-collection
RUN GOWORK=off go mod download

WORKDIR /workspace
COPY shared/ ./shared/
COPY garbage-collection/ ./garbage-collection/

WORKDIR /workspace/garbage-collection
RUN CGO_ENABLED=0 GOOS=linux GOWORK=off go build -buildvcs=false -o gc-worker ./cmd/worker

# ---- runtime ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /workspace/garbage-collection/gc-worker .

EXPOSE 8000
CMD ["/app/gc-worker"]
