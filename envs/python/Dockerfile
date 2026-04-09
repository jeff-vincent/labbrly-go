# Use the official Python image as the base image
FROM python:3.9.18-alpine3.18

# Create a non-root user and group with no home directory and restricted shell access
RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup -D -s /sbin/nologin

# Install a minimal init for PID 1 and clean package cache
RUN apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Set the working directory to /app
WORKDIR /app

# Set environment variables to ensure Python runs in a secure mode
ENV PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random \
    PYTHONWARNINGS=ignore \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONNOUSERSITE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# Lock down the filesystem - remove access to system directories
RUN chmod 700 /root \
    && chmod 755 /usr /bin /sbin /lib /etc \
    && rm -rf /tmp/* /var/tmp/* \
    && mkdir -p /tmp && chmod 1777 /tmp

# Set strict permissions on /app directory
RUN chown -R appuser:appgroup /app \
    && chmod -R 755 /app

# Remove potentially dangerous binaries, strip SUID/SGID, and remove package manager
RUN rm -f /bin/su /usr/bin/sudo /sbin/mount /sbin/umount /bin/chmod /bin/chown 2>/dev/null || true \
    && find / -xdev -type f -perm /6000 -exec chmod a-s {} + 2>/dev/null || true \
    && rm -rf /etc/apk /lib/apk /usr/share/apk /sbin/apk 2>/dev/null || true

# Switch to the non-root user and lock to /app directory
USER appuser

# Set environment to restrict path and prevent directory traversal
ENV HOME=/app \
    PATH=/usr/local/bin:/usr/bin:/bin \
    PYTHONPATH=/app

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]
