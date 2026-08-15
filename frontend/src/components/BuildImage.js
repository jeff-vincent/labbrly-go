import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { jwtDecode } from 'jwt-decode';
import Editor from '@monaco-editor/react';
import ImageBuildStatus from './ImageBuildStatus'; // added

const BuildImage = () => {
  const { getAccessTokenSilently } = useAuth0();
  const [jwt, setJwt] = useState(null);
  const [orgId, setOrgId] = useState(null);

  // Runtime/template selection
  const [runtime, setRuntime] = useState('python');
  const templates = useRef({ python: null, node: null, go: null }); // will be filled after consts are defined
  const [editorValue, setEditorValue] = useState('');
  const [allowedRanges, setAllowedRanges] = useState([]); // [{start,end}] 1-based inclusive line numbers

  // File uploads
  const [files, setFiles] = useState([]);
  const [copied, setCopied] = useState(false);
  const [copiedCheck, setCopiedCheck] = useState(false);

  // Image name + availability
  const [imageName, setImageName] = useState('');
  const [imageValidation, setImageValidation] = useState({
    checking: false,
    available: null,
    message: '',
    formatError: false,
  });
  const [buildJobName, setBuildJobName] = useState(null); // added

  // Monaco refs
  const monacoRef = useRef(null);
  const editorRef = useRef(null);
  const preventRef = useRef(false);
  const lastGoodValueRef = useRef('');
  // Hidden file/folder inputs
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  // Force dark theme for Monaco (no light/dark toggle)
  const editorTheme = 'vs-dark';

  // Fetch JWT and org_id
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const token = await getAccessTokenSilently({ audience: process.env.REACT_APP_AUTH0_AUDIENCE });
        setJwt(token);
        const decoded = jwtDecode(token);
        setOrgId(decoded['org_id']);
      } catch (e) {
        console.error('Failed to get token', e);
      }
    };
    fetchToken();
  }, [getAccessTokenSilently]);

  const pythonDockerfile = `
  # Use the official Python image as the base image
  FROM python:3.9.18-alpine3.18

  # Create a non-root user and group with no home directory and restricted shell access
  RUN addgroup -g 1000 -S appgroup && \\
      adduser -u 1000 -S appuser -G appgroup -D -s /sbin/nologin

  # Install a minimal init for PID 1 and clean package cache
  RUN apk add --no-cache dumb-init && \\
      rm -rf /var/cache/apk/*

  # Set the working directory to /app
  WORKDIR /app

  #################### EDITABLE ####################

  # Copy the application code into the container
  # EXAMPLE: COPY main.py requirements.txt check_lab.sh  /app


  # Create required files with write permissions for appuser
  # EXAMPLE: RUN touch data.db && chown appuser:appgroup data.db && chmod 644 data.db


  # Install necessary Python packages
  # EXAMPLE: RUN pip install -r requirements.txt


  # Install any additional system dependencies if needed
  # EXAMPLE: RUN apk add --no-cache <dependency>

  #################### EDITABLE ####################

  # Set environment variables to ensure Python runs in a secure mode
  ENV PYTHONUNBUFFERED=1 \\
      PYTHONHASHSEED=random \\
      PYTHONWARNINGS=ignore \\
      PYTHONDONTWRITEBYTECODE=1 \\
      PYTHONNOUSERSITE=1 \\
      PIP_DISABLE_PIP_VERSION_CHECK=1 \\
      PIP_NO_CACHE_DIR=1

  # Lock down the filesystem - remove access to system directories
  RUN chmod 700 /root \\
      && chmod 755 /usr /bin /sbin /lib /etc \\
      && rm -rf /tmp/* /var/tmp/* \\
      && mkdir -p /tmp && chmod 1777 /tmp

  # Set strict permissions on /app directory
  RUN chown -R appuser:appgroup /app \\
      && chmod -R 755 /app

  # Remove potentially dangerous binaries, strip SUID/SGID, and remove package manager
  RUN rm -f /bin/su /usr/bin/sudo /sbin/mount /sbin/umount /bin/chmod /bin/chown 2>/dev/null || true \\
      && find / -xdev -type f -perm /6000 -exec chmod a-s {} + 2>/dev/null || true \\
      && rm -rf /etc/apk /lib/apk /usr/share/apk /sbin/apk 2>/dev/null || true

  # Switch to the non-root user and lock to /app directory
  USER appuser

  # Set environment to restrict path and prevent directory traversal
  ENV HOME=/app \\
      PATH=/usr/local/bin:/usr/bin:/bin \\
      PYTHONPATH=/app

  # Use dumb-init as PID 1
  ENTRYPOINT ["dumb-init", "--"]
  `;

  const nodeDockerfile = `
  # Use the official Node.js image as the base image
FROM node:18.18.2-alpine3.18

# Create a non-root user and group with no home directory and restricted shell access
RUN addgroup -g 1001 -S appgroup && \\
    adduser -u 1001 -S appuser -G appgroup -D -s /sbin/nologin

# Install a minimal init for PID 1 and clean package cache
RUN apk add --no-cache dumb-init && \\
    rm -rf /var/cache/apk/*

# Set the working directory to /app
WORKDIR /app

#################### EDITABLE ####################

# Copy the application code into the container
# EXAMPLE: COPY package.json package-lock.json ./
# EXAMPLE: RUN npm ci --omit=dev
# EXAMPLE: COPY . .

# Create required files with write permissions for appuser
RUN touch data.db && chown appuser:appgroup data.db && chmod 644 data.db

# Install necessary Node packages
# EXAMPLE: RUN npm install --omit=dev
# or:     RUN yarn install --frozen-lockfile --production

# Install any additional system dependencies if needed
# EXAMPLE: RUN apk add --no-cache <dependency>

#################### EDITABLE ####################

# Lock down the filesystem - remove access to system directories
RUN chmod 700 /root \\
    && chmod 755 /usr /bin /sbin /lib /etc \\
    && rm -rf /tmp/* /var/tmp/* \\
    && mkdir -p /tmp && chmod 1777 /tmp

# Set strict permissions on /app directory
RUN chown -R appuser:appgroup /app \\
    && chmod -R 755 /app

# Remove potentially dangerous binaries, strip SUID/SGID, and remove package manager
RUN rm -f /bin/su /usr/bin/sudo /sbin/mount /sbin/umount /bin/chmod /bin/chown 2>/dev/null || true \\
    && find / -xdev -type f -perm /6000 -exec chmod a-s {} + 2>/dev/null || true \\
    && rm -rf /etc/apk /lib/apk /usr/share/apk /sbin/apk 2>/dev/null || true

# Switch to the non-root user and lock to /app directory
USER appuser

# Set environment to restrict path and prevent directory traversal
ENV HOME=/app \\
    PATH=/usr/local/bin:/usr/bin:/bin \\
    NODE_PATH=/app \\
    NODE_ENV=production

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]
`;

  const goDockerfile = `
# Use the official Go image as the base image
FROM golang:1.21-alpine3.18

# Create a non-root user and group with no home directory and restricted shell access
RUN addgroup -g 1000 -S appgroup && \\
    adduser -u 1000 -S appuser -G appgroup -D -s /sbin/nologin

# Install a minimal init for PID 1 and clean package cache
RUN apk add --no-cache dumb-init && \\
    rm -rf /var/cache/apk/*

# Set the working directory to /app
WORKDIR /app

# Create a proper go.mod file for the module
RUN echo "module user-env" > go.mod && \\
    echo "" >> go.mod && \\
    echo "go 1.21" >> go.mod

# Initialize the module properly and create a clean workspace
RUN go mod tidy

# Create the data.db file and cache directories with write permissions for appuser
RUN touch data.db && chown appuser:appgroup data.db && chmod 644 data.db && \\
    mkdir -p /app/.cache/go-build /app/.cache/go-mod /app/go && \\
    chown -R appuser:appgroup /app/.cache /app/go && \\
    chmod -R 755 /app/.cache && chmod 700 /app/go

#################### EDITABLE ####################

# Copy the application code into the container
# EXAMPLE: COPY . /app

# Create required files with write permissions for appuser
# EXAMPLE: RUN touch data.db && chown appuser:appgroup data.db && chmod 644 data.db

# Install necessary Go packages or build steps
# EXAMPLE: RUN go mod download
# EXAMPLE: RUN go build -o app ./...

# Install any additional system dependencies if needed
# EXAMPLE: RUN apk add --no-cache <dependency>

#################### EDITABLE ####################

# Lock down the filesystem - remove access to system directories
RUN chmod 700 /root \\
    && chmod 755 /usr /bin /sbin /lib /etc \\
    && rm -rf /tmp/* /var/tmp/* \\
    && mkdir -p /tmp && chmod 1777 /tmp

# Set strict permissions on /app directory
RUN chown -R appuser:appgroup /app \\
    && chmod -R 755 /app

# Remove potentially dangerous binaries (keep until after chown/chmod above), strip SUID/SGID, and remove package manager
RUN rm -f /bin/su /usr/bin/sudo /sbin/mount /sbin/umount /bin/chmod /bin/chown 2>/dev/null || true \\
    && find / -xdev -type f -perm /6000 -exec chmod a-s {} + 2>/dev/null || true \\
    && rm -rf /etc/apk /lib/apk /usr/share/apk /sbin/apk 2>/dev/null || true

# Switch to the non-root user and lock to /app directory
USER appuser

# Set environment to restrict path and prevent directory traversal
ENV HOME=/app \\
    PATH=/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin \\
    GOCACHE=/app/.cache/go-build \\
    GOMODCACHE=/app/.cache/go-mod \\
    GOPATH=/app/go \\
    GOPROXY=https://proxy.golang.org,direct \\
    GOSUMDB=sum.golang.org \\
    GOFLAGS=-buildvcs=false

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]
`;

  const alpineDockerfile = `
# Use the official Alpine image as the base image
FROM alpine:3.18

# Create a non-root user and group with no home directory and restricted shell access
RUN addgroup -g 1000 -S appgroup && \\
    adduser -u 1000 -S appuser -G appgroup -D -s /sbin/nologin

# Install a minimal init for PID 1 and clean package cache
RUN apk add --no-cache dumb-init && \\
    rm -rf /var/cache/apk/*

# Set the working directory to /app
WORKDIR /app

#################### EDITABLE ####################

# Copy the application code into the container
# EXAMPLE: COPY . /app

# Create required files with write permissions for appuser
# EXAMPLE: RUN touch data.db && chown appuser:appgroup data.db && chmod 644 data.db

# Install any additional system dependencies if needed
# EXAMPLE: RUN apk add --no-cache <dependency>

#################### EDITABLE ####################

# Lock down the filesystem - remove access to system directories
RUN chmod 700 /root \\
    && chmod 755 /usr /bin /sbin /lib /etc \\
    && rm -rf /tmp/* /var/tmp/* \\
    && mkdir -p /tmp && chmod 1777 /tmp

# Set strict permissions on /app directory
RUN chown -R appuser:appgroup /app \\
    && chmod -R 755 /app

# Remove potentially dangerous binaries (keep until after chown/chmod above), strip SUID/SGID, and remove package manager
RUN rm -f /bin/su /usr/bin/sudo /sbin/mount /sbin/umount /bin/chmod /bin/chown 2>/dev/null || true \\
    && find / -xdev -type f -perm /6000 -exec chmod a-s {} + 2>/dev/null || true \\
    && rm -rf /etc/apk /lib/apk /usr/share/apk /sbin/apk 2>/dev/null || true

# Switch to the non-root user and lock to /app directory
USER appuser

# Set environment to restrict path and prevent directory traversal
ENV HOME=/app \\
    PATH=/usr/local/bin:/usr/bin:/bin

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]
`;

  // Initialize templates and editor value when templates are ready or runtime changes
  useEffect(() => {
    templates.current = {
      python: pythonDockerfile,
      node: nodeDockerfile,
      go: goDockerfile,
      alpine: alpineDockerfile,
    };
  }, [pythonDockerfile, nodeDockerfile, goDockerfile, alpineDockerfile]);

  // Compute editable ranges helper
  const computeEditableRanges = (text) => {
    const lines = text.split('\n');
    const marker = '#################### EDITABLE ####################';
    const idxs = [];
    lines.forEach((l, i) => {
      if (l.includes(marker)) idxs.push(i + 1); // 1-based line numbers
    });
    const ranges = [];
    for (let i = 0; i + 1 < idxs.length; i += 2) {
      const start = idxs[i] + 1;
      const end = idxs[i + 1] - 1;
      if (start <= end) ranges.push({ start, end });
    }
    return ranges;
  };

  // Set editor value when runtime changes
  useEffect(() => {
    const tpl = templates.current[runtime] || '';
    setEditorValue(tpl);
    lastGoodValueRef.current = tpl;
    const ranges = computeEditableRanges(tpl);
    setAllowedRanges(ranges);
    if (editorRef.current) {
      preventRef.current = true;
      editorRef.current.setValue(tpl);
      preventRef.current = false;
    }
  }, [runtime]);

  // Update allowed ranges if the base template changes externally
  useEffect(() => {
    if (!editorRef.current) return;
    const ranges = computeEditableRanges(editorRef.current.getValue());
    setAllowedRanges(ranges);
  }, [editorRef.current]);

  // Check if a change range is within any allowed range
  const isWithinAllowed = (startLine, endLine) => {
    return allowedRanges.some(r => startLine >= r.start && endLine <= r.end);
  };

  // Monaco mount
  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Initial value
    if (editorValue) {
      editor.setValue(editorValue);
      lastGoodValueRef.current = editorValue;
    }

    // Intercept edits; recompute allowed ranges after each edit so editable sections remain editable as they grow
    editor.onDidChangeModelContent((e) => {
      if (preventRef.current) return;

      const model = editor.getModel();
      const newVal = model.getValue();
      const newRanges = computeEditableRanges(newVal);

      const allAllowed = e.changes.every((ch) => {
        const startLine = ch.range.startLineNumber;
        const endLine = ch.range.endLineNumber;
        return newRanges.some((r) => startLine >= r.start && endLine <= r.end);
      });

      if (!allAllowed) {
        // Revert if any change touches outside editable sections (including marker lines)
        preventRef.current = true;
        editor.setValue(lastGoodValueRef.current);
        preventRef.current = false;
        return;
      }

      // Accept change: persist value and the recomputed ranges
      lastGoodValueRef.current = newVal;
      setEditorValue(newVal);
      setAllowedRanges(newRanges);
    });
  };

  // Debounced image name availability check
  const checkImageAvailability = useCallback(
    async (name) => {
      if (!name) return;
      // Skip if format invalid (hyphen first in class to avoid pattern issues)
      if (!/^[-a-z]+$/.test(name)) return;
      setImageValidation(v => ({ ...v, checking: true, available: null, message: 'Checking availability...', formatError: false }));
      try {
        const res = await fetch('/orgs/image-available', {
          method: 'POST',
          headers: 
          { 'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`,
           },
          body: JSON.stringify({ image_name: name }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const available = data.available;
          setImageValidation({
            checking: false,
            available,
            message: available ? 'Image name is available' : 'Image name is already taken',
            formatError: false,
          });
        } else {
          setImageValidation({ checking: false, available: null, message: 'Unable to check availability', formatError: false });
        }
      } catch {
        setImageValidation({ checking: false, available: null, message: 'Unable to check availability', formatError: false });
      }
    },
    [orgId]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (imageName.length > 0 && /^[-a-z]+$/.test(imageName)) {
        checkImageAvailability(imageName);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [imageName, checkImageAvailability]);

  // File upload handlers (supports directories via webkitRelativePath)
  const onFileInput = (e) => {
    const incoming = Array.from(e.target.files || []);
    if (!incoming.length) return;
    setFiles((prev) => {
      const keyFor = (f) => (f.webkitRelativePath || f.name) + ':' + f.size + ':' + f.lastModified;
      const map = new Map(prev.map(f => [keyFor(f), f]));
      incoming.forEach(f => map.set(keyFor(f), f));
      return Array.from(map.values());
    });
    e.target.value = '';
  };
  const removeFile = (fileObj) => {
    setFiles(prev => prev.filter((f) => f !== fileObj));
  };

  // Group for display: directories (by root) and single files
  const grouped = useMemo(() => {
    const folders = new Map(); // root folder -> files[]
    const singles = [];
    for (const f of files) {
      const rel = f.webkitRelativePath || '';
      if (rel && rel.includes('/')) {
        const root = rel.split('/')[0];
        const arr = folders.get(root) || [];
        arr.push(f);
        folders.set(root, arr);
      } else {
        singles.push(f);
      }
    }
    return { folders, singles };
  }, [files]);

  const removeFolder = (root) => {
    setFiles(prev => prev.filter(f => {
      const rel = f.webkitRelativePath || '';
      return !(rel && (rel === root || rel.startsWith(root + '/')));
    }));
  };

  // Submit
  const handleSubmit = async () => {
    try {
      setBuildJobName(null); // reset before new submission
      const token = jwt || await getAccessTokenSilently({ audience: process.env.REACT_APP_AUTH0_AUDIENCE });
      const fd = new FormData();
      // Edited Dockerfile
      const dockerfileBlob = new Blob([editorValue], { type: 'text/plain' });
      fd.append('dockerfile', dockerfileBlob, 'Dockerfile');
      fd.append('runtime', runtime);
      fd.append('image_name', imageName);
      if (orgId) fd.append('org_id', orgId);
      // Uploaded files
      files.forEach((file) => {
        // Preserve relative directory structure if available
        const rel = file.webkitRelativePath && file.webkitRelativePath.length > 0 ? file.webkitRelativePath : file.name;
        fd.append('files', file, rel);
      });

      const res = await fetch('/builder/build', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Request failed with ${res.status}`);
      }

      let jobName = null;
      const headerJob = res.headers.get('x-job-name');
      if (headerJob) jobName = headerJob;

      const contentType = res.headers.get('content-type') || '';
      if (!jobName && contentType.includes('application/json')) {
        try {
          const data = await res.json();
            jobName =
              data.job_name ||
              data.jobName ||
              data.job ||
              data.name ||
              null;
        } catch (e) {
          console.warn('Failed to parse JSON response for job name', e);
        }
      } else if (!jobName) {
        // Fallback: attempt to read raw text and regex extract
        try {
          const text = await res.text();
          const m =
            text.match(/"job_name"\s*:\s*"([^"]+)"/) ||
            text.match(/"job"\s*:\s*"([^"]+)"/) ||
            text.match(/job\s*[:=]\s*([A-Za-z0-9._-]+)/);
          if (m) jobName = m[1];
          else console.warn('No job name found in text response');
        } catch (e) {
          console.warn('Failed to read text response for job name', e);
        }
      }

      if (jobName) {
        setBuildJobName(jobName);
      } else {
        console.warn('Build succeeded but no job name was returned; status modal not shown.');
      }
      // ...existing code... (e.g., notify success)
    } catch (err) {
      console.error('Submit failed', err);
      // ...existing code... (e.g., notify error)
    }
  };

  // UI
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Template selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label htmlFor="runtime">Template:</label>
        <select
          id="runtime"
          value={runtime}
          onChange={(e) => setRuntime(e.target.value)}
          className="block w-56 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:opacity-50"
        >
          <option value="python">Python</option>
          <option value="node">Node</option>
          <option value="go">Go</option>
          <option value="alpine">Alpine</option>
        </select>
      </div>

      {/* Image name */}
      <div>
        <label htmlFor="image_name" className="block text-sm font-medium text-gray-700 mb-2">
          Image Name
        </label>
        <input
          type="text"
          id="image_name"
          name="image_name"
          value={imageName}
          onChange={(e) => {
            const val = e.target.value;
            setImageName(val);
            if (!val) {
              setImageValidation(v => ({ ...v, checking: false, formatError: false, available: null, message: '' }));
              return;
            }
            if (!/^[-a-z]+$/.test(val)) {
              setImageValidation(v => ({
                ...v,
                checking: false,
                available: null,
                formatError: true,
                message: 'Image name must use only lowercase letters and hyphens',
              }));
              return;
            }
            setImageValidation(v => ({
              ...v,
              formatError: false,
              message: v.available === null ? '' : v.message,
            }));
          }}
          pattern="[-a-z]+"
          className={`w-56 px-3 py-2 rounded-md border text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
            imageValidation.formatError
              ? 'border-red-500 bg-red-50'
              : imageValidation.available === true
              ? 'border-green-500 bg-green-50'
              : imageValidation.available === false
              ? 'border-red-500 bg-red-50'
              : 'border-gray-300'
          }`}
          required
        />
        {imageValidation.checking && (
          <div className="mt-1 flex items-center text-sm text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500 mr-2"></div>
            {imageValidation.message}
          </div>
        )}
        {!imageValidation.checking && imageValidation.message && (
          <p
            className={`mt-1 text-sm ${
              imageValidation.formatError
                ? 'text-red-600'
                : imageValidation.available === true
                ? 'text-green-600'
                : imageValidation.available === false
                ? 'text-red-600'
                : 'text-gray-600'
            }`}
          >
            {imageValidation.message}
          </p>
        )}
      </div>

      {/* Dev tip */}
      {(() => {
        const devTipText = `# Build from the directory that contains your Dockerfile and app files
docker build -t my-image:dev .

# Run container in the background, idle for interactive debugging
docker run -d --name my-image-dev -v "$PWD":/app -w /app my-image:dev tail -f /dev/null

# Exec into the running container
docker exec -it my-image-dev /bin/sh

# When done
docker rm -f my-image-dev`;
        return (
          <div className="rounded-md border border-gray-700 bg-gray-900 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-100">Dev/debug tip</p>
                <p className="mt-1 text-sm text-gray-300">
                  For faster iteration, keep a flat directory with all resources alongside your Dockerfile,
                  build from that directory, then run an idle container and exec into it to test.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(devTipText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch (e) {
                    console.warn('Copy failed', e);
                  }
                }}
                aria-label="Copy dev tip commands"
                className={`shrink-0 inline-flex items-center rounded border px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 ${
                  copied
                    ? 'border-green-600 bg-green-700/20 text-green-300'
                    : 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
                title={copied ? 'Copied!' : 'Copy to clipboard'}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="mt-3 overflow-x-auto rounded border border-gray-700 bg-gray-800 p-3 text-xs text-gray-100 font-mono">
{devTipText}
            </pre>
          </div>
        );
      })()}

      {/* Scoring tip: check_lab.sh requirement */}
      {(() => {
        const checkTipText = `# check_lab.sh - return exit code 0 when the lab is complete
#!/bin/sh
set -euo pipefail

# Example checks (customize these to your lab):
# 1) Ensure a required file exists
if [ ! -f "/app/main.py" ]; then
  echo "Missing /app/main.py"
  exit 1
fi

# 2) Validate program output contains an expected string
# out=$(python /app/main.py)
# echo "$out" | grep -q "EXPECTED_OUTPUT" || { echo "Output check failed"; exit 1; }

echo "All checks passed"
exit 0
`;
        return (
          <div className="rounded-md border border-gray-700 bg-gray-900 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-100">Scoring requirement</p>
                <p className="mt-1 text-sm text-gray-300">
                  To have your lab scored, include a <span className="font-mono">check_lab.sh</span> script in the image
                  that verifies completion. The script must exit with <span className="font-mono">0</span> when the lab is complete,
                  and a non-zero code otherwise.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(checkTipText);
                    setCopiedCheck(true);
                    setTimeout(() => setCopiedCheck(false), 1500);
                  } catch (e) {
                    console.warn('Copy failed', e);
                  }
                }}
                aria-label="Copy check_lab.sh template"
                className={`shrink-0 inline-flex items-center rounded border px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 ${
                  copiedCheck
                    ? 'border-green-600 bg-green-700/20 text-green-300'
                    : 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
                title={copiedCheck ? 'Copied!' : 'Copy to clipboard'}
              >
                {copiedCheck ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="mt-3 overflow-x-auto rounded border border-gray-700 bg-gray-800 p-3 text-xs text-gray-100 font-mono">
{checkTipText}
            </pre>
          </div>
        );
      })()}

      {/* Monaco editor */}
  <div className="rounded-xl shadow-lg border overflow-hidden border-gray-700 bg-gray-900">
        <Editor
          height="60vh"
          defaultLanguage="dockerfile"
          value={editorValue}
          onChange={(val) => {
            if (preventRef.current) return;
            setEditorValue(val ?? '');
          }}
          options={{
            readOnly: false, // enforced via our change interceptor
            wordWrap: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            fontSize: 14,
          }}
          theme={editorTheme}
          onMount={handleEditorMount}
        />
      </div>

      {/* File upload */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-3 flex-wrap items-center">
          {/* Visible buttons trigger hidden inputs to avoid duplicate-looking native pickers */}
          <button
            type="button"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            aria-label="Add files"
            title="Add files"
            className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
          >
            Add files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={onFileInput}
            className="sr-only"
          />

          <button
            type="button"
            onClick={() => folderInputRef.current && folderInputRef.current.click()}
            aria-label="Add folder"
            title="Add folder"
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            Add folder
          </button>
          <input
            ref={folderInputRef}
            type="file"
            multiple
            webkitdirectory=""
            directory=""
            onChange={onFileInput}
            className="sr-only"
          />
        </div>
        {(grouped.folders.size > 0 || grouped.singles.length > 0) && (
          <ul className="mt-2 space-y-2">
            {/* Folders as single entries */}
            {Array.from(grouped.folders.entries()).map(([root, filesInFolder]) => (
              <li
                key={`folder:${root}`}
                className="flex items-center max-w-full rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm"
              >
                <span
                  className="truncate text-sm text-gray-800"
                  title={`${root} (${filesInFolder.length} files)`}
                >
                  {root}/ <span className="text-gray-500">({filesInFolder.length} files)</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFolder(root)}
                  aria-label={`Remove folder ${root}`}
                  className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded
                             text-red-600 hover:text-red-700 hover:bg-red-50
                             focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
                  title="Remove folder"
                >
                  ×
                </button>
              </li>
            ))}
            {/* Single files individually */}
    {grouped.singles.map((f, i) => (
              <li
                key={`file:${f.name}:${i}`}
                className="flex items-center max-w-full rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm"
              >
                <span
                  className="truncate text-sm text-gray-800"
                  title={`${f.name} (${f.size} bytes)`}
                >
                  {f.name}
                </span>
                <button
                  type="button"
      onClick={() => removeFile(f)}
                  aria-label={`Remove ${f.name}`}
                  className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded
                             text-red-600 hover:text-red-700 hover:bg-red-50
                             focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
                  title="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Submit */}
      <div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            !editorValue ||
            !imageName ||
            imageValidation.formatError ||
            imageValidation.checking ||
            imageValidation.available === false
          }
          className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Submit
        </button>
      </div>
      {buildJobName && (
        <ImageBuildStatus
          job_name={buildJobName}
          imageName={imageName} // added
          onClose={() => setBuildJobName(null)}
        />
      )}
    </div>
  );
};

export default BuildImage;

