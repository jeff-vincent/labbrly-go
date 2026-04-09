# Build context: labbrly-go/ (workspace root)
# docker build -f billing/Dockerfile .
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

# Copy shared module (required by replace directive)
COPY shared/ ./shared/

# Copy billing module
COPY billing/ ./billing/

WORKDIR /workspace/billing
RUN CGO_ENABLED=0 GOOS=linux GOWORK=off go build -buildvcs=false -o billing ./cmd/worker

# ---- runtime ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /workspace/billing/billing .

CMD ["/app/billing"]
