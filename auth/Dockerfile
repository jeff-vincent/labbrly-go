# Build context: labbrly-go/ (workspace root)
# docker build -f auth/Dockerfile .
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

COPY shared/ ./shared/
COPY auth/ ./auth/

WORKDIR /workspace/auth
RUN CGO_ENABLED=0 GOOS=linux GOWORK=off go build -buildvcs=false -o auth ./cmd/server

# ---- runtime ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /workspace/auth/auth .

EXPOSE 8000
CMD ["/app/auth"]
