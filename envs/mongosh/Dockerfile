
# Use the official Alpine image as the base image
FROM alpine:3.18

# Create a non-root user and group with no home directory and restricted shell access
RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup -D -s /sbin/nologin

# Install a minimal init for PID 1 and clean package cache
RUN apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Set the working directory to /app
WORKDIR /app

#################### EDITABLE ####################

# Install mongosh and dependencies (glibc needed)
RUN apk add --no-cache curl tar openssl && \
    curl -fsSL -o /etc/apk/keys/sgerrand.rsa.pub https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub && \
    curl -fsSL -o glibc.apk https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.35-r0/glibc-2.35-r0.apk && \
    apk add --no-cache glibc.apk && \
    rm glibc.apk

ENV MONGOSH_VERSION=1.4.2
ENV MONGOSH_TARBALL=mongosh-${MONGOSH_VERSION}-linux-x64.tgz
ENV MONGOSH_URL=https://downloads.mongodb.com/compass/${MONGOSH_TARBALL}
ENV MONGOSH_SHA256=bf2e1939ce5cf012ffc4e4acf81ee4d53f79bd44646be44ef676ce3579814fb2

RUN curl -fsSL "$MONGOSH_URL" -o /tmp/${MONGOSH_TARBALL} && \
    echo "${MONGOSH_SHA256}  /tmp/${MONGOSH_TARBALL}" | sha256sum -c - && \
    tar -xzf /tmp/${MONGOSH_TARBALL} -C /usr/local --strip-components=1 && \
    rm /tmp/${MONGOSH_TARBALL}

#################### EDITABLE ####################


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
    PATH=/usr/local/bin:/usr/bin:/bin

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]
