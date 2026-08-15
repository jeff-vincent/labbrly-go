import React, { useState, useEffect, useRef } from 'react';
import HttpProxyViewer from './HttpProxyViewer';
import { Terminal as XTerm } from 'xterm';
import 'xterm/css/xterm.css';

// Single terminal session (previous implementation) renamed to TerminalInner
// This component keeps its original functionality and styling so we can host multiple instances above it.
const TerminalInner = ({ terminalText, embedded = false }) => {
  console.log('Terminal: Component initialized with terminalText:', terminalText);
  
  const [inputValue, setInputValue] = useState('');
  const [output, setOutput] = useState([]);
  const [connected, setConnected] = useState(false);
  const [currentLine, setCurrentLine] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isCommandRunning, setIsCommandRunning] = useState(false);
  const [proxyBase, setProxyBase] = useState(null); // absolute URL or path proxy fallback
  const [showProxyForm, setShowProxyForm] = useState(false);
  const [proxyPort, setProxyPort] = useState(() => {
    try { return localStorage.getItem('last-proxy-port') || '3000'; } catch { return '3000'; }
  });
  const [proxyBusy, setProxyBusy] = useState(false);
  const [proxyError, setProxyError] = useState('');
  
  const wsRef = useRef(null);
  const retryTimeoutRef = useRef(null);

  // Live state refs to avoid stale closures in xterm event handlers
  const connectedRef = useRef(false);
  const isCommandRunningRef = useRef(false);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    isCommandRunningRef.current = isCommandRunning;
  }, [isCommandRunning]);

  // xterm refs
  const xtermRef = useRef(null);
  const xtermContainerRef = useRef(null);
  const inputBufferRef = useRef('');
  const lastEmitRef = useRef({ t: 0, buf: '' });
  const inCSIRef = useRef(false);
  const renderDisposeRef = useRef(null);
  // Resizable/collapsible height state
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem('terminal-height') || '', 10);
      return Number.isFinite(v) && v >= 160 ? v : 420;
    } catch { return 420; }
  });
  const dragRef = useRef({ dragging: false, startY: 0, startH: 420 });
  const MIN_H = 160;
  const MAX_H = 800;
  const STEP_H = 16;
  const BIG_STEP_H = 48;

  // Simple throttle for render-driven snapshots
  const throttle = (fn, wait) => {
    let last = 0;
    let timer = null;
    return (...args) => {
      const now = Date.now();
      if (now - last >= wait) {
        last = now;
        fn(...args);
      } else if (!timer) {
        const remaining = wait - (now - last);
        timer = setTimeout(() => {
          last = Date.now();
          timer = null;
          fn(...args);
        }, remaining);
      }
    };
  };

  const SANITIZE_LIMIT = 2000;
  const sanitizeText = (s, limit = SANITIZE_LIMIT) => {
    if (typeof s !== 'string') return '';
    try {
      let t = s;
      t = t.replace(/\bhttps?:\/\/\S+|\bwww\.[^\s]+/gi, '[URL]');
      t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]');
      t = t.replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[TOKEN]');
      t = t.replace(/\bsk-[A-Za-z0-9]{16,}\b/gi, '[SECRET]');
      t = t.replace(/\bghp_[A-Za-z0-9]{20,}\b/gi, '[SECRET]');
      t = t.replace(/[A-Fa-f0-9]{24,}/g, '[HEX]');
      t = t.replace(/\d{6,}/g, '[NUM]');
      t = t.replace(/\s+/g, ' ').trim();
      return t.slice(0, limit);
    } catch {
      return (s || '').toString().slice(0, limit);
    }
  };

  // Preserve newlines for terminal output while still redacting secrets
  const sanitizeOutput = (s, limit = SANITIZE_LIMIT) => {
    if (typeof s !== 'string') return '';
    try {
      let t = s.replace(/\r\n?|\u2028|\u2029/g, '\n');
      t = t.replace(/\bhttps?:\/\/\S+|\bwww\.[^\s]+/gi, '[URL]');
      t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]');
      t = t.replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[TOKEN]');
      t = t.replace(/\bsk-[A-Za-z0-9]{16,}\b/gi, '[SECRET]');
      t = t.replace(/\bghp_[A-Za-z0-9]{20,}\b/gi, '[SECRET]');
      t = t.replace(/[A-Fa-f0-9]{24,}/g, '[HEX]');
      t = t.replace(/\d{6,}/g, '[NUM]');
      // collapse spaces/tabs but keep newlines; reduce excessive blank lines
      t = t.replace(/[\t ]+/g, ' ');
      t = t.replace(/\n{3,}/g, '\n\n');
      t = t.trim();
      return t.slice(0, limit);
    } catch {
      return (s || '').toString().slice(0, limit);
    }
  };

  const getXtermContent = () => {
    try {
      const term = xtermRef.current;
      if (!term || !term.buffer || !term.buffer.active) return '';
      const buf = term.buffer.active;
      const total = buf.length || 0;
      const start = Math.max(0, total - 300); // last ~300 lines
      const lines = [];
      for (let i = start; i < total; i++) {
        const line = buf.getLine(i);
        if (!line) continue;
        const s = line.translateToString(true);
        lines.push(s);
      }
      return lines.join('\n');
    } catch {
      return '';
    }
  };

  const emitTerminalSnapshot = (force = false) => {
    try {
      const now = Date.now();
      // Throttle to ~1/sec unless forced
      if (!force && now - lastEmitRef.current.t < 900) return;
      const el = xtermContainerRef.current;
      if (!el) return;
  const raw = getXtermContent();
  const text = sanitizeOutput(raw);
      if (!text) return;
      lastEmitRef.current = { t: now, buf: text };
      const detail = {
        outputs: [
          {
            tag: 'div',
            id: el.id || '',
            classes: el.className ? String(el.className).split(/\s+/).slice(0, 3) : [],
            role: el.getAttribute?.('role') || '',
            text,
            len: raw.length,
            lines: (raw.match(/\n/g) || []).length + 1,
            preview: text.slice(0, 200),
          },
        ],
      };
  const evt = new CustomEvent('terminal_output', { detail, bubbles: true, composed: true });
  el.dispatchEvent(evt);
    } catch {
      // ignore
    }
  };

  function writeToXterm(text, cb) {
    if (!xtermRef.current) return;
    try {
      xtermRef.current.write(text, typeof cb === 'function' ? cb : undefined);
    } catch {
      xtermRef.current.write(text);
      if (typeof cb === 'function') setTimeout(cb, 0);
    }
  }
  function writelnToXterm(text = '', cb) {
    if (!xtermRef.current) return;
    try {
      xtermRef.current.writeln(text, typeof cb === 'function' ? cb : undefined);
    } catch {
      xtermRef.current.write(String(text) + '\r\n');
      if (typeof cb === 'function') setTimeout(cb, 0);
    }
  }
  function prompt() {
    xtermRef.current?.write('\r\n$ ');
  }

  // Initialize xterm once
  useEffect(() => {
    if (xtermRef.current) return;

    xtermRef.current = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 12,
      theme: {
        background: '#111827', // bg-gray-900
        foreground: '#D1D5DB', // text-gray-300
        cursor: '#F59E0B',     // amber-ish
        black: '#111827',
        brightBlack: '#6B7280',
        red: '#F87171',
        green: '#34D399',
        yellow: '#FBBF24',
        blue: '#60A5FA',
        magenta: '#F472B6',
        cyan: '#22D3EE',
        white: '#E5E7EB',
        brightWhite: '#FFFFFF',
      },
      scrollback: 1000,
    });

    xtermRef.current.open(xtermContainerRef.current);
    // Snapshot after xterm actually renders frames
    try {
      const throttledRenderEmit = throttle(() => {
        try { emitTerminalSnapshot(false); } catch {}
      }, 500);
      const disp = xtermRef.current.onRender(() => {
        throttledRenderEmit();
      });
      renderDisposeRef.current = disp;
    } catch {}
    xtermRef.current.focus();

    // Initial banner / provided text
    if (terminalText) {
      writelnToXterm(terminalText, () => setTimeout(() => emitTerminalSnapshot(true), 50));
    }

  // Handle user input keystrokes (send through to backend; do not locally echo)
    xtermRef.current.onData((data) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      // Forward all keystrokes to the backend. The shell will echo and prompt.
      ws.send(data);

      // Locally track printable characters to build a command line snapshot
      try {
        for (const ch of data) {
          // Handle ANSI escape/control sequences (CSI) from key events
          if (ch === '\x1b') { // ESC
            inCSIRef.current = true;
            continue;
          }
          if (inCSIRef.current) {
            const code = ch.charCodeAt(0);
            if (code >= 0x40 && code <= 0x7e) {
              inCSIRef.current = false; // CSI sequence ended
            }
            continue;
          }

          if (ch === '\r' || ch === '\n') {
            const raw = inputBufferRef.current;
            const text = sanitizeText(raw);
            if (text) {
              const el = xtermContainerRef.current;
              const detail = { input: { text, len: raw.length } };
              if (el) {
                const evt = new CustomEvent('terminal_input', { detail, bubbles: true, composed: true });
                el.dispatchEvent(evt);
              }
            }
            inputBufferRef.current = '';
          } else if (ch === '\u007F') {
            // Backspace
            inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          } else if (ch >= ' ' && ch <= '~') {
            inputBufferRef.current += ch;
          } else {
            // ignore control sequences
          }
        }
      } catch {
        // ignore
      }
    });

    // Cleanup xterm on unmount
    return () => {
      xtermRef.current?.dispose();
      xtermRef.current = null;
      try { renderDisposeRef.current?.dispose?.(); } catch {}
      renderDisposeRef.current = null;
    };
  }, [terminalText]);

  // Ensure xterm viewport shows a visible scrollbar (override xterm.css default)
  useEffect(() => {
    const STYLE_ID = 'xterm-scrollbar-override';
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .xterm-viewport { scrollbar-width: thin; overflow-y: auto !important; }
      .xterm-viewport::-webkit-scrollbar { width: 8px; height: 8px; }
      .xterm-viewport::-webkit-scrollbar-thumb { background-color: rgba(148,163,184,0.6); border-radius: 8px; }
      .xterm-viewport:hover::-webkit-scrollbar-thumb { background-color: rgba(148,163,184,0.85); }
      .xterm-viewport::-webkit-scrollbar-track { background-color: transparent; }
    `;
    document.head.appendChild(style);
    return () => {
      try { document.getElementById(STYLE_ID)?.remove(); } catch {}
    };
  }, []);

  useEffect(() => {
    console.log('Terminal: useEffect triggered with terminalText:', terminalText);
    
    if (terminalText) {
      console.log('Terminal: Setting initial output with terminalText');
      setOutput([{ type: 'info', content: terminalText }]);
      // Mirror to xterm as well
      writelnToXterm(terminalText);
    }
    
    // Initialize WebSocket connection
    initWebSocket();
    
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [terminalText]);

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const initWebSocket = async (retryAttempt = 0) => {
    const accessToken = localStorage.getItem('jwt');
    if (!accessToken) {
      setOutput(prev => [...prev, { type: 'error', content: 'Authentication required' }]);
      writelnToXterm('\x1b[31mAuthentication required\x1b[0m');
      return;
    }

    // Extract user info from token (you may need to adjust this based on your token structure)
    const tokenPayload = JSON.parse(atob(accessToken.split('.')[1]));
    const userId = tokenPayload.user_id;
    const namespace = tokenPayload.org_id;

    // Add initial sleep period for dev environment spin-up on first attempt
    if (retryAttempt === 0) {
      const msg = 'Initializing development environment...';
      setOutput(prev => [...prev, { type: 'info', content: msg }]);
      writelnToXterm(`\x1b[34m${msg}\x1b[0m`);
      await sleep(3000); // 3 second initial wait for environment setup
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/compute/terminal/${userId}`;
    
    // Create WebSocket. Auth is handled via the first-frame handshake below
    // (browsers cannot set custom headers on WebSocket upgrade requests).
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      connectedRef.current = true;
      setIsRetrying(false);
      setRetryCount(0);

      // Send auth info with JWT token
      wsRef.current.send(JSON.stringify({
        namespace: namespace,
        user_id: userId,
        auth_token: accessToken
      }));

      writelnToXterm('\x1b[32mConnected\x1b[0m');
      // Removed local prompt; rely on shell prompt from the container
      xtermRef.current?.focus();
    };
    
    wsRef.current.onmessage = (event) => {
      // Gracefully handle either JSON or plain text payloads
      let message = null;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        // Not JSON, treat as plain text stream from the container
      }

    if (message && typeof message === 'object' && message.type) {
        console.log('WebSocket message received:', message);

        if (message.type === 'output') {
    writeToXterm(message.content ?? '', () => setTimeout(() => emitTerminalSnapshot(true), 10));
        } else if (message.type === 'command_complete') {
          // No local prompt; typing is always enabled
          setIsCommandRunning(false);
          isCommandRunningRef.current = false;
        } else if (message.type === 'command_cancelled') {
          setIsCommandRunning(false);
          isCommandRunningRef.current = false;
          // Do not print local ^C or prompt; shell handles it
        } else if (message.type === 'error') {
          const errorContent = message.content ?? 'Unknown error';
          setOutput(prev => [...prev, { type: 'error', content: errorContent }]);
          writelnToXterm(`\x1b[31m${errorContent}\x1b[0m`, () => setTimeout(() => emitTerminalSnapshot(true), 10));
          setIsCommandRunning(false);

          if (errorContent.toLowerCase().includes('pod not found') || 
              errorContent.toLowerCase().includes('environment not ready')) {
            handleRetryableError(retryAttempt);
          }
        } else {
          if (typeof message.content === 'string') {
            writeToXterm(message.content);
          }
        }
        return;
      }

      // Fallback: raw text from backend (shell output, prompts, etc.)
      if (typeof event.data === 'string') {
  writeToXterm(event.data, () => setTimeout(() => emitTerminalSnapshot(true), 10));
      } else {
        try {
          if (event.data instanceof Blob) {
            event.data
              .text()
              .then((txt) => {
                writeToXterm(txt, () => setTimeout(() => emitTerminalSnapshot(true), 10));
              })
              .catch(() => {});
          } else if (event.data instanceof ArrayBuffer) {
            const txt = new TextDecoder().decode(event.data);
            writeToXterm(txt, () => setTimeout(() => emitTerminalSnapshot(true), 10));
          }
        } catch {
          // swallow
        }
      }
    };
    
    wsRef.current.onclose = (event) => {
      console.log('WebSocket disconnected', event.code, event.reason);
      setConnected(false);
      connectedRef.current = false;
      writelnToXterm('\r\n\x1b[33mDisconnected from server\x1b[0m');
      
      if (event.code === 1011 || event.code === 1006 || event.reason?.includes('pod not found')) {
        handleRetryableError(retryAttempt);
      } else {
        setOutput(prev => [...prev, { type: 'error', content: 'Connection lost. Refresh to reconnect.' }]);
        writelnToXterm('\x1b[31mConnection lost. Refresh to reconnect.\x1b[0m');
      }
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnected(false);
      connectedRef.current = false;
      writelnToXterm('\x1b[31mConnection error\x1b[0m');
      handleRetryableError(retryAttempt);
    };
  };

  const handleRetryableError = async (currentRetryAttempt) => {
    const maxRetries = 5;
    const newRetryCount = currentRetryAttempt + 1;
    
    if (newRetryCount <= maxRetries) {
      setIsRetrying(true);
      setRetryCount(newRetryCount);
      
      const baseDelay = Math.pow(2, newRetryCount) * 1000;
      const jitter = Math.random() * 1000;
      const retryDelay = baseDelay + jitter;
      
      const msg = `Environment not ready. Retrying in ${Math.round(retryDelay/1000)}s... (${newRetryCount}/${maxRetries})`;
      setOutput(prev => [...prev, { type: 'info', content: msg }]);
      writelnToXterm(`\x1b[33m${msg}\x1b[0m`);
      
      retryTimeoutRef.current = setTimeout(() => {
        initWebSocket(newRetryCount);
      }, retryDelay);
    } else {
      setIsRetrying(false);
      const msg = 'Failed to connect after multiple attempts. The development environment may not be available.';
      setOutput(prev => [...prev, { type: 'error', content: msg }]);
      writelnToXterm(`\x1b[31m${msg}\x1b[0m`);
    }
  };

  const handleInputChange = (event) => {
    setInputValue(event.target.value);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    // ...existing code...
  };

  const handleKeyDown = (event) => {
    // Input is now captured directly by xterm; keep this as a no-op.
  };

  const clearTerminal = () => {
    setOutput([]);
    setCurrentLine('');
    inputBufferRef.current = '';
    xtermRef.current?.clear();
    // Removed local prompt injection
  };

  console.log('Terminal: Rendering component');
  const onResizeDown = (e) => {
    e.preventDefault();
    dragRef.current = { dragging: true, startY: e.clientY, startH: height };
    const move = (ev) => {
      if (!dragRef.current.dragging) return;
      const dy = ev.clientY - dragRef.current.startY;
      const next = Math.max(MIN_H, Math.min(MAX_H, dragRef.current.startH + dy));
      setHeight(next);
    };
    const up = () => {
      dragRef.current.dragging = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      try { localStorage.setItem('terminal-height', String(height)); } catch {}
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, { once: true });
  };

  // Top-edge resize (for embedded mode)
  const onResizeTopDown = (e) => {
    e.preventDefault();
    dragRef.current = { dragging: true, startY: e.clientY, startH: height };
    const move = (ev) => {
      if (!dragRef.current.dragging) return;
      const dy = dragRef.current.startY - ev.clientY; // drag up => increase height
      const next = Math.max(MIN_H, Math.min(MAX_H, dragRef.current.startH + dy));
      setHeight(next);
    };
    const up = () => {
      dragRef.current.dragging = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      try { localStorage.setItem('terminal-height', String(height)); } catch {}
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, { once: true });
  };

  // Keyboard-accessible resizing for a11y
  const onResizeKeyDown = (e) => {
    if (collapsed) return;
    const key = e.key;
    const big = e.shiftKey;
    let next = null;
    if (key === 'ArrowUp') {
      next = Math.max(MIN_H, height - (big ? BIG_STEP_H : STEP_H));
    } else if (key === 'ArrowDown') {
      next = Math.min(MAX_H, height + (big ? BIG_STEP_H : STEP_H));
    } else if (key === 'Home') {
      next = MIN_H;
    } else if (key === 'End') {
      next = MAX_H;
    }
    if (next != null) {
      e.preventDefault();
      setHeight(next);
      try { localStorage.setItem('terminal-height', String(next)); } catch {}
    }
  };

  // Keyboard handler for top-edge resizer (embedded mode)
  const onResizeKeyDownTop = (e) => {
    if (collapsed) return;
    const key = e.key;
    const big = e.shiftKey;
    let next = null;
    if (key === 'ArrowUp') {
      next = Math.min(MAX_H, height + (big ? BIG_STEP_H : STEP_H));
    } else if (key === 'ArrowDown') {
      next = Math.max(MIN_H, height - (big ? BIG_STEP_H : STEP_H));
    } else if (key === 'Home') {
      next = MIN_H;
    } else if (key === 'End') {
      next = MAX_H;
    }
    if (next != null) {
      e.preventDefault();
      setHeight(next);
      try { localStorage.setItem('terminal-height', String(next)); } catch {}
    }
  };
  
  // Listen for Copilot terminal command events
  useEffect(() => {
    const handler = (e) => {
      try {
        const cmd = e?.detail?.command;
        if (!cmd || !xtermRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        // Send command plus newline to execute
        wsRef.current.send(cmd + '\n');
        // Emit a terminal_input event mirroring what was sent
        try {
          const text = sanitizeText(cmd);
          const detail = { input: { text, len: cmd.length } };
          const el = xtermContainerRef.current;
          if (el) {
            el.dispatchEvent(new CustomEvent('terminal_input', { detail, bubbles: true, composed: true }));
          }
        } catch {}
      } catch {}
    };
    document.addEventListener('copilot_terminal_command', handler, true);
    return () => {
      document.removeEventListener('copilot_terminal_command', handler, true);
    };
  }, []);

  const containerClass = embedded
    ? 'rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden'
    : 'bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden';

  return (
  <>
  <div className={containerClass} data-testid="terminal" data-nosnapshot data-component="terminal" style={{ height: collapsed ? 56 : height }}>
      {/* Top Resize handle (embedded mode) */}
      {!collapsed && embedded && (
        <div
          onMouseDown={onResizeTopDown}
          onKeyDown={onResizeKeyDownTop}
          className="h-2 w-full cursor-row-resize bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
          title="Drag to resize terminal"
          aria-label="Resize terminal"
          role="separator"
          aria-orientation="horizontal"
          aria-controls="terminal-body"
          aria-valuemin={MIN_H}
          aria-valuemax={MAX_H}
          aria-valuenow={height}
          tabIndex={0}
        >
          <div className="h-1 w-24 rounded bg-gray-400" />
        </div>
      )}
      {/* Terminal Header */}
      <div
        className={
          embedded
            ? 'px-3 py-2 border-b bg-gray-50 border-gray-200 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700'
            : 'bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center justify-between'
        }
      >
        <div className="flex items-center gap-2">
          {embedded ? (
            <>
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  connected ? 'bg-green-500' : isRetrying ? 'bg-yellow-500' : 'bg-gray-400'
                }`}
              />
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100">Terminal</h3>
              {isCommandRunning && (
                <span className="text-xs text-amber-500">[Running]</span>
              )}
            </>
          ) : (
            <>
              <div className="flex space-x-2">
                <div className={"w-3 h-3 bg-red-500 rounded-full"}></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <h3 className="text-white font-semibold ml-4">
                Interactive Terminal {
                  connected ? '(Connected)' :
                  isRetrying ? `(Retrying ${retryCount}/5...)` :
                  '(Disconnected)'
                }
                {isCommandRunning && <span className="text-yellow-400 ml-2">[Running]</span>}
              </h3>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* HTTP Proxy controls */}
          <button
            onClick={() => { setShowProxyForm(v => !v); setProxyError(''); }}
            type="button"
            className={
              embedded
                ? 'inline-flex items-center justify-center text-xs p-2 rounded-md transition-colors ring-1 ring-inset bg-white text-gray-700 ring-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700'
                : 'inline-flex items-center justify-center text-xs p-2 rounded-md transition-colors ring-1 ring-inset bg-gray-700 text-gray-200 ring-gray-600 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800'
            }
            aria-label="Toggle port-forward input"
            title="Open a port-forwarded service viewer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 3h7m0 0v7m0-7L10 14" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10v11h11" />
            </svg>
            <span className="sr-only">Open HTTP proxy viewer</span>
          </button>
          {showProxyForm && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setProxyError('');
                const containerPort = parseInt(proxyPort, 10);
                if (!Number.isFinite(containerPort) || containerPort < 1 || containerPort > 65535) {
                  setProxyError('Enter a valid port (1-65535)');
                  return;
                }
                try {
                  setProxyBusy(true);
                  // Subdomain-only policy: we require the backend subdomain issuance endpoint.
                  // No fallback to /compute/proxy/http path mode to ensure frameworks (Next.js, Vite, FastAPI)
                  // run at origin '/' with correct asset + websocket assumptions.
                  const jwt = localStorage.getItem('jwt');
                  const hostRes = await fetch(`/compute/proxy/host/${containerPort}`, { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} });
                  if (hostRes.status === 409) {
                    throw new Error('Pod not running');
                  }
                  if (!hostRes.ok) {
                    throw new Error('Subdomain host issuance failed');
                  }
                  const data = await hostRes.json();
                  if (!data?.url) {
                    throw new Error('No URL returned');
                  }
                  setProxyBase(data.url);
                  try { localStorage.setItem('last-proxy-port', String(containerPort)); } catch {}
                  setShowProxyForm(false);
                } catch (err) {
                  console.error('Proxy init failed:', err);
                  setProxyError('Subdomain unavailable. Ensure environment running & feature enabled.');
                } finally {
                  setProxyBusy(false);
                }
              }}
              className="flex items-center gap-1"
            >
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="65535"
                value={proxyPort}
                onChange={(e) => setProxyPort(e.target.value)}
                placeholder="port"
                aria-label="Container port"
                className={
                  embedded
                    ? 'w-20 px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700'
                    : 'w-20 px-2 py-1 text-xs rounded border border-gray-600 bg-gray-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
                }
              />
              <button
                type="submit"
                disabled={proxyBusy}
                className={
                  embedded
                    ? 'px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50'
                    : 'px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50'
                }
              >Open</button>
              {proxyError && (
                <span className="text-[11px] ml-1 text-red-500">{proxyError}</span>
              )}
            </form>
          )}
          {/* Expand/Collapse icon button */}
          <button
            onClick={() => setCollapsed(c => !c)}
            type="button"
            className="inline-flex items-center justify-center text-xs p-2 rounded-md transition-colors ring-1 ring-inset bg-gray-700 text-gray-200 ring-gray-600 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            aria-label={collapsed ? 'Expand terminal' : 'Collapse terminal'}
            title={collapsed ? 'Expand terminal' : 'Collapse terminal'}
          >
            {collapsed ? (
              // Maximize icon
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
              </svg>
            ) : (
              // Minimize icon
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 15h16M4 9h16" />
              </svg>
            )}
            <span className="sr-only">{collapsed ? 'Expand' : 'Collapse'}</span>
          </button>

          {/* Clear icon button */}
          <button
            onClick={clearTerminal}
            type="button"
            disabled={isCommandRunning}
            className={
              embedded
                ? 'inline-flex items-center justify-center text-xs p-2 rounded-md transition-colors ring-1 ring-inset bg-white text-gray-700 ring-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700 dark:focus:ring-blue-500 dark:focus:ring-offset-gray-900'
                : 'inline-flex items-center justify-center text-xs p-2 rounded-md transition-colors ring-1 ring-inset bg-gray-700 text-gray-200 ring-gray-600 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800'
            }
            aria-label="Clear terminal"
            title="Clear terminal"
          >
            {/* Trash icon */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-3h4m-6 0h8m-9 3h10m-8 0v11m4-11v11" />
            </svg>
            <span className="sr-only">Clear</span>
          </button>
        </div>
      </div>

      {/* Terminal Body */}
  <div id="terminal-body" className="bg-gray-900 overflow-auto" style={{ height: collapsed ? 0 : `calc(${height - 56}px)` }}>
        {/* xterm mounts here; container keeps existing styling */}
        <div
          ref={xtermContainerRef}
          className="p-4 font-mono text-sm terminal-output h-full"
          tabIndex={0} // ensure focusable
          onClick={() => xtermRef.current?.focus()}
        />

        {/* Connection status (preserve styling) */}
        {!connected && (
          <div className="mt-2 text-yellow-400 px-4 pb-4">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-yellow-400 mr-2"></div>
              {isRetrying ? 
                `Retrying connection (${retryCount}/5)... Environment may be starting up.` :
                'Connecting to terminal...'
              }
            </div>
          </div>
        )}
      </div>
      {/* Resize handle */}
  {!collapsed && !embedded && (
        <div
          onMouseDown={onResizeDown}
          onKeyDown={onResizeKeyDown}
          className="h-2 w-full cursor-row-resize bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
          title="Drag to resize terminal"
          aria-label="Resize terminal"
          role="separator"
          aria-orientation="horizontal"
          aria-controls="terminal-body"
          aria-valuemin={MIN_H}
          aria-valuemax={MAX_H}
          aria-valuenow={height}
          tabIndex={0}
        >
          <div className="h-1 w-24 rounded bg-gray-400" />
        </div>
      )}
    </div>
    {proxyBase && (
      <HttpProxyViewer basePath={proxyBase} onClose={() => setProxyBase(null)} />
    )}
  </>
  );
};

// Wrapper component adding tab support and + button while reusing existing session component.
// Each tab hosts an independent TerminalInner (WebSocket + xterm). Only the active tab is visible.
const Terminal = ({ terminalText, embedded = false }) => {
  const [sessions, setSessions] = useState(() => [{ id: 1 }]);
  const [activeId, setActiveId] = useState(1);
  const nextIdRef = useRef(2);

  const addSession = () => {
    const id = nextIdRef.current++;
    setSessions(prev => [...prev, { id }]);
    setActiveId(id);
  };
  const closeSession = (id) => {
    if (sessions.length === 1) return; // keep at least one
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeId === id) {
      // Switch to first remaining session
      const remaining = sessions.filter(s => s.id !== id);
      if (remaining.length) setActiveId(remaining[0].id);
    }
  };

  // Lightweight status tracking for tab labels (connected / retrying)
  // We'll listen to custom events dispatched by inner terminals to infer connection state heuristically.
  const [statusMap, setStatusMap] = useState({}); // id -> { connected, retrying, retryCount }
  useEffect(() => {
    const handler = (e) => {
      // We rely on terminal_output events as a heartbeat for 'connected' after initial mount.
      // This is heuristic; a more robust approach would expose callbacks via props/refs.
      const now = Date.now();
      setStatusMap(m => ({ ...m, lastOutput: now }));
    };
    document.addEventListener('terminal_output', handler);
    return () => document.removeEventListener('terminal_output', handler);
  }, []);

  return (
    <div className={embedded ? 'rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden' : 'bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden'} data-component="terminal-tabs">
      {/* Tabs bar */}
      <div className={embedded ? 'flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700' : 'flex items-center gap-1 px-3 py-2 bg-gray-800 border-b border-gray-700'}>
        {sessions.map((s, idx) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={
                embedded
                  ? `relative text-xs px-3 py-1.5 rounded-md border ${active ? 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100' : 'bg-gray-200 dark:bg-gray-700 border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`
                  : `relative text-xs px-3 py-1.5 rounded-md border ${active ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-600 border-transparent text-gray-200 hover:bg-gray-500'}`
              }
              role="tab"
              aria-selected={active}
            >
              Terminal {idx + 1}
              {sessions.length > 1 && (
                <span
                  onClick={(e) => { e.stopPropagation(); closeSession(s.id); }}
                  className={embedded ? 'ml-2 inline-flex items-center justify-center w-4 h-4 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-[11px]' : 'ml-2 inline-flex items-center justify-center w-4 h-4 rounded hover:bg-gray-500 text-[11px]'}
                  aria-label={`Close terminal ${idx + 1}`}
                  role="button"
                >
                  ×
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={addSession}
          type="button"
          aria-label="New terminal"
          title="New terminal"
          className={embedded ? 'ml-1 inline-flex items-center justify-center w-7 h-7 rounded-md border border-dashed border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm' : 'ml-1 inline-flex items-center justify-center w-7 h-7 rounded-md border border-dashed border-gray-500 text-gray-200 hover:bg-gray-700 text-sm'}
        >
          +
        </button>
      </div>
      {/* Sessions: render all for proper lifecycle; hide inactive via CSS so their WebSockets remain until closed */}
      <div className={embedded ? '' : 'bg-gray-900'}>
        {sessions.map(s => (
          <div key={s.id} style={{ display: s.id === activeId ? 'block' : 'none' }}>
            <TerminalInner terminalText={terminalText} embedded={embedded} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default Terminal;
