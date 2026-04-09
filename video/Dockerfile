# Build context: labbrly-go/ (workspace root)
# docker build -f video/Dockerfile .
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

COPY shared/ ./shared/
COPY video/ ./video/

WORKDIR /workspace/video
RUN CGO_ENABLED=0 GOOS=linux GOWORK=off go build -buildvcs=false -o video ./cmd/server

# ---- runtime ----
FROM alpine:3.19

# ffmpeg is required for video compression
RUN apk add --no-cache ca-certificates tzdata ffmpeg

WORKDIR /app
COPY --from=builder /workspace/video/video .

EXPOSE 8000
CMD ["/app/video"]
