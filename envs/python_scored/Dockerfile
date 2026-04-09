# Use the official Python image as the base image
FROM python:3.9.18-alpine3.18

# Create a non-root user and group with no home directory and restricted shell access
RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup -D -s /sbin/nologin

# Set the working directory to /app
WORKDIR /app

# Create the data.db file with write permissions for appuser
RUN touch data.db && chown appuser:appgroup data.db && chmod 644 data.db

# Copy and set permissions for check_lab.sh as root
COPY check_lab.sh /app/
RUN chown appuser:appgroup /app/check_lab.sh && chmod 755 /app/check_lab.sh

# Lock down the filesystem - remove access to system directories
RUN chmod 700 /root \
    && chmod 755 /usr /bin /sbin /lib /etc \
    && rm -rf /tmp/* /var/tmp/* \
    && mkdir -p /tmp && chmod 1777 /tmp

# Set strict permissions on /app directory
RUN chown -R appuser:appgroup /app \
    && chmod -R 755 /app

# Remove potentially dangerous binaries and create restricted environment
RUN rm -f /bin/su /usr/bin/sudo /sbin/mount /sbin/umount /bin/chmod /bin/chown 2>/dev/null || true

# Switch to the non-root user and lock to /app directory
USER appuser

# Set environment to restrict path and prevent directory traversal
ENV HOME=/app \
    PATH=/usr/local/bin:/usr/bin:/bin \
    PYTHONPATH=/app
