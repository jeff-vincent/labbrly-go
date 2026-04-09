# Build context: labbrly-go/ (workspace root)
# docker build -f llm-proxy/Dockerfile .
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

COPY shared/ ./shared/
COPY llm-proxy/ ./llm-proxy/

WORKDIR /workspace/llm-proxy
RUN CGO_ENABLED=0 GOOS=linux GOWORK=off go build -buildvcs=false -o llm-proxy ./cmd/server

# ---- runtime ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /workspace/llm-proxy/llm-proxy .

EXPOSE 8000
CMD ["/app/llm-proxy"]
