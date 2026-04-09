# Build context: labbrly-go/ (workspace root)
# docker build -f orgs/Dockerfile .
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

COPY shared/ ./shared/
COPY orgs/ ./orgs/

WORKDIR /workspace/orgs
RUN CGO_ENABLED=0 GOOS=linux GOWORK=off go build -buildvcs=false -o orgs ./cmd/server

# ---- runtime ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /workspace/orgs/orgs .

EXPOSE 8000
CMD ["/app/orgs"]
