# Use the official Go image as the base image
FROM golang:1.21-alpine3.18

# Create a non-root user and group with no home directory and restricted shell access
RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup -D -s /sbin/nologin

# Install a minimal init for PID 1 and clean package cache
RUN apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Set the working directory to /app
WORKDIR /app

# Create a proper go.mod file for the module
RUN echo "module user-env" > go.mod && \
    echo "" >> go.mod && \
    echo "go 1.21" >> go.mod

# Initialize the module properly and create a clean workspace
RUN go mod tidy

# Create the data.db file and cache directories with write permissions for appuser
RUN touch data.db && chown appuser:appgroup data.db && chmod 644 data.db && \
    mkdir -p /app/.cache/go-build /app/.cache/go-mod /app/go && \
    chown -R appuser:appgroup /app/.cache /app/go && \
    chmod -R 755 /app/.cache && chmod 700 /app/go

# Lock down the filesystem - remove access to system directories
RUN chmod 700 /root \
    && chmod 755 /usr /bin /sbin /lib /etc \
    && rm -rf /tmp/* /var/tmp/* \
    && mkdir -p /tmp && chmod 1777 /tmp

# Set strict permissions on /app directory
RUN chown -R appuser:appgroup /app \
    && chmod -R 755 /app

# Remove potentially dangerous binaries (keep until after chown/chmod above), strip SUID/SGID, and remove package manager
RUN rm -f /bin/su /usr/bin/sudo /sbin/mount /sbin/umount /bin/chmod /bin/chown 2>/dev/null || true \
    && find / -xdev -type f -perm /6000 -exec chmod a-s {} + 2>/dev/null || true \
    && rm -rf /etc/apk /lib/apk /usr/share/apk /sbin/apk 2>/dev/null || true

# Switch to the non-root user and lock to /app directory
USER appuser

# Set environment to restrict path and prevent directory traversal
ENV HOME=/app \
    PATH=/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin \
    GOCACHE=/app/.cache/go-build \
    GOMODCACHE=/app/.cache/go-mod \
    GOPATH=/app/go \
    GOPROXY=https://proxy.golang.org,direct \
    GOSUMDB=sum.golang.org \
    GOFLAGS=-buildvcs=false

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]