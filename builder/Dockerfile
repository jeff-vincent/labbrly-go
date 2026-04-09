# Build context: labbrly-go/ (workspace root)
# docker build -f builder/Dockerfile .
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

COPY shared/go.mod shared/go.sum ./shared/
COPY builder/go.mod builder/go.sum ./builder/
WORKDIR /workspace/builder
RUN GOWORK=off go mod download

WORKDIR /workspace
COPY shared/ ./shared/
COPY builder/ ./builder/

WORKDIR /workspace/builder
RUN CGO_ENABLED=0 GOOS=linux GOWORK=off go build -buildvcs=false -o builder ./cmd/server

# ---- runtime ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /workspace/builder/builder .

EXPOSE 8000
CMD ["/app/builder"]
