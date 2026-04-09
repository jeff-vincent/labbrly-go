import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/*
  Simplified HttpProxyViewer (subdomain-only)
  - Pure iframe pointing at issued subdomain (origin '/') for user workload.
  - No HTML rewriting or interception.
  - All navigation stays inside iframe naturally.
*/
const HttpProxyViewer = ({ basePath, onClose }) => {
  // Track in-iframe path (client-side only; does not attempt to read iframe location cross-origin).
  const [path, setPath] = useState('/');
  const [addrInput, setAddrInput] = useState('/');
  const [pos, setPos] = useState({ x: 40, y: 40 });
  const [size, setSize] = useState(() => {
    if (typeof window === 'undefined') return { w: 900, h: 600 };
    return {
      w: Math.min(Math.floor(window.innerWidth * 0.9), 980),
      h: Math.min(Math.floor(window.innerHeight * 0.85), 720),
    };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dragRef = useRef({ dragging: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const resizeRef = useRef({ resizing: false, sx: 0, sy: 0, sw: 0, sh: 0 });
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  // New: grab JWT once. Do not react to changes for stability.
  const jwtRef = useRef(typeof window !== 'undefined' ? localStorage.getItem('jwt') : null);
  // Track if we've already appended the token to avoid leaking it repeatedly in history/navigation.
  const tokenAppendedRef = useRef(false);

  const isAbsolute = /^https?:\/\//i.test(basePath || '');
  const absUrl = useMemo(() => {
    if (!basePath) return '';
    if (isAbsolute) {
      // For subdomain absolute URLs (already rooted at /), only vary when path changes from '/'
      if (path === '/' || !path) return basePath;
      const trimmed = basePath.endsWith('/') ? basePath.slice(0,-1) : basePath;
      let p = path.startsWith('/') ? path : '/' + path;
      return `${trimmed}${p}`;
    }
    // (Legacy path-proxy fallback removed; basePath expected to be absolute.)
    let base = basePath.endsWith('/') ? basePath.slice(0,-1) : basePath;
    let p = path || '/';
    if (!p.startsWith('/')) p = '/' + p;
    return `${base}${p}`;
  }, [basePath, path, isAbsolute]);

  // Derive iframe src, injecting token once if needed.
  const iframeSrc = useMemo(() => {
    if (!absUrl) return '';
    try {
      const urlObj = new URL(absUrl);
      // Host-scoped bootstrap: allow one token param per unique subdomain host to refresh cookie when switching ports/users.
      const host = urlObj.host;
      const key = `lt_proxy_bootstrap:${host}`;
      const bootstrapDone = typeof window !== 'undefined' && sessionStorage.getItem(key) === '1';
      if (jwtRef.current && !bootstrapDone && !urlObj.searchParams.has('token')) {
        urlObj.searchParams.set('token', jwtRef.current);
        try { sessionStorage.setItem(key, '1'); } catch {}
        return urlObj.toString();
      }
      return urlObj.toString();
    } catch {
      return absUrl;
    }
  }, [absUrl]);

  // Load handling
  const onIframeLoad = useCallback(() => {
    setLoading(false);
    setError('');
  }, []);

  useEffect(() => {
    if (!iframeSrc) return;
    setLoading(true);
    setError('');
  }, [iframeSrc]);

  // Drag handlers
  const onDragStart = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    dragRef.current = { dragging: true, sx: e.clientX, sy: e.clientY, ox: rect?.left ?? pos.x, oy: rect?.top ?? pos.y };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd, { once: true });
  };
  const onDragMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    const maxX = Math.max(0, window.innerWidth - size.w - 8);
    const maxY = Math.max(0, window.innerHeight - size.h - 8);
    setPos({ x: clamp(dragRef.current.ox + dx, 0, maxX), y: clamp(dragRef.current.oy + dy, 0, maxY) });
  };
  const onDragEnd = () => { dragRef.current.dragging = false; window.removeEventListener('mousemove', onDragMove); };

  // Resize handlers
  const onResizeStart = (e) => {
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    resizeRef.current = { resizing: true, sx: e.clientX, sy: e.clientY, sw: rect?.width ?? size.w, sh: rect?.height ?? size.h };
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd, { once: true });
  };
  const onResizeMove = (e) => {
    if (!resizeRef.current.resizing) return;
    const dx = e.clientX - resizeRef.current.sx;
    const dy = e.clientY - resizeRef.current.sy;
    const MIN_W = 360, MIN_H = 240;
    const maxW = Math.max(320, window.innerWidth - pos.x - 8);
    const maxH = Math.max(200, window.innerHeight - pos.y - 8);
    const nw = clamp(resizeRef.current.sw + dx, MIN_W, maxW);
    const nh = clamp(resizeRef.current.sh + dy, MIN_H, maxH);
    setSize({ w: nw, h: nh });
  };
  const onResizeEnd = () => { resizeRef.current.resizing = false; window.removeEventListener('mousemove', onResizeMove); };

  useEffect(() => {
    const onWinResize = () => {
      setSize((s) => ({
        w: Math.min(s.w, Math.floor(window.innerWidth * 0.95)),
        h: Math.min(s.h, Math.floor(window.innerHeight * 0.95)),
      }));
      setPos((p) => ({
        x: clamp(p.x, 0, Math.max(0, window.innerWidth - size.w - 8)),
        y: clamp(p.y, 0, Math.max(0, window.innerHeight - size.h - 8)),
      }));
    };
    window.addEventListener('resize', onWinResize);
    return () => {
      window.removeEventListener('resize', onWinResize);
      // Defensive: cancel any pending reload timers (none currently tracked)
    };
  }, [size.w, size.h]);

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none">
      <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={onClose} />
      <div
        ref={containerRef}
        className="absolute pointer-events-auto bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border"
        style={{ left: pos.x, top: pos.y, width: `${size.w}px`, height: `${size.h}px` }}
      >
        <div
          className="cursor-move select-none flex flex-col gap-1 px-3 py-2 bg-gray-100 border-b border-gray-200 dark:bg-cp-panel-alt dark:border-cp-border"
          onMouseDown={onDragStart}
          role="toolbar"
          aria-label="HTTP proxy viewer controls"
          tabIndex={0}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 40 : 12;
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
              e.preventDefault();
              setPos(p => {
                let { x, y } = p;
                if (e.key === 'ArrowUp') y = clamp(y - step, 0, Math.max(0, window.innerHeight - size.h - 8));
                if (e.key === 'ArrowDown') y = clamp(y + step, 0, Math.max(0, window.innerHeight - size.h - 8));
                if (e.key === 'ArrowLeft') x = clamp(x - step, 0, Math.max(0, window.innerWidth - size.w - 8));
                if (e.key === 'ArrowRight') x = clamp(x + step, 0, Math.max(0, window.innerWidth - size.w - 8));
                return { x, y };
              });
            }
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">HTTP Proxy</span>
              <span className="ml-2 text-xs text-gray-500 dark:text-neutral-400 truncate max-w-[260px]" title={basePath}>{basePath}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-cp-panel"
                onClick={(e) => { e.stopPropagation(); if (iframeRef.current) window.open(iframeRef.current.src, '_blank', 'noopener,noreferrer'); }}
                title="Open in new tab"
                aria-label="Open in new tab"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M14 3h7m0 0v7m0-7L10 14" /><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 10v11h11" /></svg>
              </button>
              <button
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-cp-panel"
                onClick={(e) => { e.stopPropagation(); setLoading(true); if (iframeRef.current) { iframeRef.current.src = absUrl; } }}
                title="Refresh"
                aria-label="Refresh"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M5 19A9 9 0 0019 5"/></svg>
              </button>
              <button
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-cp-panel"
                onClick={(e) => { e.stopPropagation(); onClose?.(); }}
                title="Close"
                aria-label="Close"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M6.225 4.811a1 1 0 011.414 0L12 9.172l4.361-4.361a1 1 0 111.414 1.414L13.414 10.586l4.361 4.361a1 1 0 01-1.414 1.414L12 12l-4.361 4.361a1 1 0 01-1.414-1.414l4.361-4.361-4.361-4.361a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
              </button>
            </div>
          </div>
          {/* Address bar */}
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              let raw = addrInput.trim();
              if (!raw.startsWith('/')) raw = '/' + raw;
              setPath(raw);
            }}
          >
            <input
              type="text"
              aria-label="Path"
              placeholder="/"
              value={addrInput}
              onChange={(e)=> setAddrInput(e.target.value)}
              onKeyDown={(e)=> { if(e.key==='Escape'){ e.stopPropagation(); e.currentTarget.blur(); } }}
              className="flex-1 text-xs px-2 py-1 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-cp-panel dark:border-cp-border dark:text-neutral-100"
            />
            <button
              type="submit"
              className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Go"
              aria-label="Navigate"
            >Go</button>
          </form>
        </div>
        {/* Content */}
        <div className="w-full h-[calc(100%-76px)] overflow-hidden bg-white dark:bg-cp-panel relative">
          {loading && <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-600 dark:text-neutral-300">Loading…</div>}
          {error && <div className="absolute inset-0 p-4 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}
          <iframe
            ref={iframeRef}
            key={iframeSrc}
            title="proxy-iframe"
            className="w-full h-full border-0"
            src={iframeSrc}
            onLoad={onIframeLoad}
            onError={() => { setLoading(false); setError('Failed to load'); }}
          />
          <div
            onMouseDown={onResizeStart}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 60 : 20;
              if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
                e.preventDefault();
                setSize(sz => {
                  let { w, h } = sz;
                  if (e.key === 'ArrowRight') w = clamp(w + step, 360, Math.max(320, window.innerWidth - pos.x - 8));
                  if (e.key === 'ArrowLeft') w = clamp(w - step, 360, Math.max(320, window.innerWidth - pos.x - 8));
                  if (e.key === 'ArrowDown') h = clamp(h + step, 240, Math.max(200, window.innerHeight - pos.y - 8));
                  if (e.key === 'ArrowUp') h = clamp(h - step, 240, Math.max(200, window.innerHeight - pos.y - 8));
                  return { w, h };
                });
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                const input = containerRef.current?.querySelector('input');
                input?.focus();
              }
            }}
            title="Resize"
            aria-label="Resize viewer"
            role="slider"
            tabIndex={0}
            aria-valuetext={`${size.w}x${size.h}`}
            className="absolute right-1 bottom-1 w-4 h-4 cursor-se-resize outline-none focus:ring-2 focus:ring-blue-500 rounded"
            style={{ backgroundImage: 'linear-gradient(135deg, transparent 50%, rgba(148,163,184,0.9) 50%)', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }}
          />
        </div>
      </div>
    </div>
  );
};

export default HttpProxyViewer;
