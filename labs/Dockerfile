FROM golang:1.22-alpine AS builder

WORKDIR /build

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -mod=vendor -buildvcs=false -o labs ./cmd/server

# ---- runtime ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /build/labs .

EXPOSE 8000
CMD ["/app/labs"]
