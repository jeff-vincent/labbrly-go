import React, { useEffect, useRef } from 'react';

// Config
const DEFAULT_MODEL = 'gpt-4o-mini';
const SNAPSHOT_LIMIT = 500; // max characters for captured text snapshot
const OUTPUT_SNAPSHOT_LIMIT = 1000; // per output area
const OUTPUT_SCAN_LIMIT = 20; // max nodes scanned per flush

// Utils
const now = () => Date.now();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const collapse = (s = '') => s.replace(/\s+/g, ' ').trim();
const safeStr = (s) => (typeof s === 'string' ? collapse(s).slice(0, 200) : '');
const throttle = (fn, ms) => {
  let last = 0;
  let timer = null;
  return (...args) => {
    const t = Date.now();
    const remaining = ms - (t - last);
    if (remaining <= 0) {
      last = t;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  };
};

const debounce = (fn, ms) => {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

// Heuristics to collect a sanitized snapshot of user-entered content
const SNAPSHOT_SELECTORS = ['#editor', '.lab-answer'];
const OUTPUT_SELECTORS = [
  '#editor',
  '.lab-answer',
  '.copilot-output',
  '#output',
  '.output',
  '.outputs',
  '.result',
  '.results',
  '.console',
  '.terminal',
  '#terminal',
  '.ide-output',
  '.notebook-output',
  '.stdout',
  '.stderr',
  'pre',
  'code',
  '[role="log"]',
  '[role="status"]',
];
// For input snapshots we consider the same high-value areas plus contenteditable
const INPUT_SELECTORS = ['#editor', '.lab-answer', '[contenteditable=""]', '[contenteditable="true"]'];

function isTextInput(el) {
  try {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag !== 'input') return false;
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'search', 'url', 'email', 'number', 'tel'].includes(type);
  } catch {
    return false;
  }
}

function isPasswordLike(el) {
  try {
    const type = (el?.getAttribute?.('type') || '').toLowerCase();
    return type === 'password';
  } catch {
    return false;
  }
}

function sanitizeText(s, limit = SNAPSHOT_LIMIT) {
  if (typeof s !== 'string') return '';
  try {
    let t = s;
    // Redact urls, emails, obvious tokens, and long digit sequences
    t = t.replace(/\bhttps?:\/\/\S+|\bwww\.[^\s]+/gi, '[URL]');
    t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]');
  t = t.replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[TOKEN]'); // JWT-like
  t = t.replace(/\bsk-[A-Za-z0-9]{16,}\b/g, '[SECRET]'); // OpenAI-style
  t = t.replace(/\bghp_[A-Za-z0-9]{20,}\b/g, '[SECRET]'); // GitHub token-like
    t = t.replace(/[A-Fa-f0-9]{24,}/g, '[HEX]');
    t = t.replace(/\d{6,}/g, '[NUM]');
    // Collapse whitespace and trim
    t = collapse(t);
    return t.slice(0, limit);
  } catch {
    return safeStr(s).slice(0, limit);
  }
}

function getSnapshotContainer(target) {
  try {
    if (!target || typeof target.closest !== 'function') return null;
    for (const sel of SNAPSHOT_SELECTORS) {
      const el = target.closest(sel);
      if (el) return { el, selector: sel };
    }
    // Also consider closest contenteditable region
    const ce = target.closest('[contenteditable=""],[contenteditable="true"]');
    if (ce) return { el: ce, selector: 'contenteditable' };
  } catch {}
  return null;
}

function extractElementText(el) {
  try {
    if (!el) return '';
    const tag = el.tagName?.toLowerCase?.();
    if (tag === 'textarea') return el.value || '';
    if (tag === 'input') return typeof el.value === 'string' ? el.value : '';
    // Prefer innerText when available for user-visible text; fallback to textContent
    return (typeof el.innerText === 'string' && el.innerText) || el.textContent || '';
  } catch {
    return '';
  }
}

function buildSnapshotForTarget(target) {
  try {
    if (!target || (target.closest && target.closest('[data-nosnapshot]'))) return null;
    // Direct inputs/textareas
    if (isPasswordLike(target)) return null;
    if (isTextInput(target) || target.tagName?.toLowerCase?.() === 'textarea') {
      const raw = extractElementText(target);
      const text = sanitizeText(raw);
      return {
        text,
        len: raw?.length || 0,
        lines: (raw?.match(/\n/g) || []).length + (raw ? 1 : 0),
        source: target.tagName?.toLowerCase?.() || 'input',
      };
    }

    // Containers (#editor, .lab-answer, or contenteditable)
    const container = getSnapshotContainer(target);
    if (container?.el) {
      // honor explicit opt-out on container
      if (container.el.closest && container.el.closest('[data-nosnapshot]')) return null;
      const raw = extractElementText(container.el);
      const text = sanitizeText(raw);
      return {
        text,
        len: raw?.length || 0,
        lines: (raw?.match(/\n/g) || []).length + (raw ? 1 : 0),
        source: container.selector,
      };
    }
  } catch {}
  return null;
}

function describeNodeShort(el) {
  try {
    const tag = el?.tagName?.toLowerCase?.() || '';
    const id = (el?.id || '').slice(0, 60);
    const cls = (el?.className && String(el.className)) || '';
    const classes = cls ? cls.split(/\s+/).slice(0, 3) : [];
    const role = el?.getAttribute?.('role') || '';
    return { tag, id, classes, role };
  } catch {
    return {};
  }
}

function collectOutputSnapshots(limit = 3) {
  try {
    if (typeof document === 'undefined') return [];
    const sel = OUTPUT_SELECTORS.join(',');
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll(sel));
    } catch {
      nodes = [];
    }
    if (!nodes.length) return [];
    // Deduplicate by element
    const seen = new Set();
    const items = [];
    for (const el of nodes) {
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (el.closest && el.closest('[data-nosnapshot]')) continue;
      const raw = extractElementText(el);
      const len = (raw || '').length;
      if (len < 5) continue;
      items.push({ el, raw, len });
      if (items.length >= OUTPUT_SCAN_LIMIT) break;
    }
    items.sort((a, b) => b.len - a.len);
    const top = items.slice(0, limit);
    return top.map(({ el, raw }) => ({
      ...describeNodeShort(el),
      text: sanitizeText(raw, OUTPUT_SNAPSHOT_LIMIT),
      len: raw.length,
      lines: (raw.match(/\n/g) || []).length + 1,
    }));
  } catch {
    return [];
  }
}

// Collect sanitized snapshots of likely input areas (IDE/editor content the user typed)
function collectInputSnapshots(limit = 2) {
  try {
    if (typeof document === 'undefined') return [];
    const sel = INPUT_SELECTORS.join(',');
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll(sel));
    } catch {
      nodes = [];
    }
    if (!nodes.length) return [];
    const seen = new Set();
    const items = [];
    for (const el of nodes) {
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (el.closest && el.closest('[data-nosnapshot]')) continue;
      const raw = extractElementText(el);
      const len = (raw || '').length;
      if (len < 5) continue;
      items.push({ el, raw, len });
      if (items.length >= OUTPUT_SCAN_LIMIT) break; // reuse scan cap
    }
    items.sort((a, b) => b.len - a.len);
    const top = items.slice(0, limit);
    return top.map(({ el, raw }) => ({
      ...describeNodeShort(el),
      text: sanitizeText(raw, SNAPSHOT_LIMIT),
      len: raw.length,
      lines: (raw.match(/\n/g) || []).length + 1,
    }));
  } catch {
    return [];
  }
}

// Try to derive a stable user id from JWT in localStorage
function getUserIdFromJWT() {
  try {
    const jwt =
      localStorage.getItem('jwt') ||
      localStorage.getItem('token') ||
      localStorage.getItem('auth_token');
    if (!jwt || typeof jwt !== 'string') return '';
    const parts = jwt.split('.');
    if (parts.length < 2) return '';
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json || '{}');
    return payload.user_id || payload.sub || '';
  } catch {
    return '';
  }
}

function describeTarget(el) {
  if (!el || typeof el !== 'object') return {};
  try {
    const tag = el.tagName?.toLowerCase?.() || '';
    const id = el.id || '';
    const cls = (el.className && String(el.className)) || '';
    const role = el.getAttribute?.('role') || '';
    const name = el.getAttribute?.('name') || '';
    const ariaLabel = el.getAttribute?.('aria-label') || '';
    const placeholder = el.getAttribute?.('placeholder') || '';
    const type = el.type || '';
    // Avoid PII by capturing only lengths or categories
    const valueLen = typeof el.value === 'string' ? el.value.length : undefined;
    return {
      tag,
      id: id ? id.slice(0, 60) : '',
      classes: cls ? cls.split(/\s+/).slice(0, 6) : [],
      role,
      name: name ? name.slice(0, 60) : '',
      ariaLabel: safeStr(ariaLabel),
      placeholder: safeStr(placeholder),
      type,
      valueLen,
      clickable: typeof el.click === 'function',
    };
  } catch {
    return {};
  }
}

function normalizeEvent(evt) {
  const base = {
    t: now(),
    page: {
      url: typeof window !== 'undefined' ? window.location.href : '',
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      title: typeof document !== 'undefined' ? document.title : '',
      visible: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
    },
  };

  try {
    switch (evt.type) {
      case 'render_snapshot':
        return { ...base, type: 'render_snapshot', outputs: Array.isArray(evt.outputs) ? evt.outputs : [] };
      case 'terminal_output':
        return {
          ...base,
          type: 'terminal_output',
          outputs:
            Array.isArray(evt.outputs)
              ? evt.outputs
              : Array.isArray(evt.detail?.outputs)
              ? evt.detail.outputs
              : [],
        };
      case 'ide_input':
        return {
          ...base,
          type: 'ide_input',
          input:
            evt.input && typeof evt.input === 'object'
              ? evt.input
              : evt.detail && typeof evt.detail.input === 'object'
              ? evt.detail.input
              : undefined,
        };
      case 'copilot_output':
        return {
          ...base,
          type: 'copilot_output',
          outputs:
            Array.isArray(evt.outputs)
              ? evt.outputs
              : Array.isArray(evt.detail?.outputs)
              ? evt.detail.outputs
              : [],
        };
      case 'ide_output':
        try {
          const raw = Array.isArray(evt.outputs)
            ? evt.outputs
            : Array.isArray(evt.detail?.outputs)
            ? evt.detail.outputs
            : [];
          const outputs = raw
            .filter((o) => o && typeof o === 'object')
            .map((o) => {
              const text = typeof o.text === 'string' ? o.text : '';
              return {
                tag: safeStr(o.tag || ''),
                id: safeStr(String(o.id || '')).slice(0, 60),
                classes: Array.isArray(o.classes) ? o.classes.slice(0, 3) : [],
                role: safeStr(o.role || ''),
                text: sanitizeText(text, OUTPUT_SNAPSHOT_LIMIT),
                len: text.length || 0,
                lines: (text.match(/\n/g) || []).length + (text ? 1 : 0),
              };
            });
          return { ...base, type: 'ide_output', outputs };
        } catch {
          return { ...base, type: 'ide_output', outputs: [] };
        }
      case 'terminal_input':
        return {
          ...base,
          type: 'terminal_input',
          input:
            evt.input && typeof evt.input === 'object'
              ? evt.input
              : evt.detail && typeof evt.detail.input === 'object'
              ? evt.detail.input
              : undefined,
        };
      case 'copilot_input':
        return {
          ...base,
          type: 'copilot_input',
          input:
            evt.input && typeof evt.input === 'object'
              ? evt.input
              : evt.detail && typeof evt.detail.input === 'object'
              ? evt.detail.input
              : undefined,
        };
      default:
        return { ...base, type: evt.type };
    }
  } catch {
    return { ...base, type: 'unknown' };
  }
}

// Determine if normalized event carries textual user input or system output
function isTextualEvent(norm) {
  if (!norm || typeof norm !== 'object') return false;
  const type = norm.type;
  if (type === 'session_start') return false; // exclude structural noise
  if (type === 'terminal_input') {
    const text = norm?.input?.text;
    return typeof text === 'string' && text.trim().length > 0;
  }
  if (type === 'ide_input') {
    const text = norm?.input?.text;
    return typeof text === 'string' && text.trim().length > 0;
  }
  if (type === 'terminal_output' || type === 'copilot_output' || type === 'ide_output' || type === 'render_snapshot') {
    const outs = norm.outputs;
    if (Array.isArray(outs)) {
      return outs.some(o => typeof o?.text === 'string' && o.text.trim().length > 0);
    }
    return false;
  }
  if (type === 'copilot_input') {
    const txt = norm?.input?.text;
    return typeof txt === 'string' && txt.trim().length > 0;
  }
  if (type === 'blur') { // only if snapshot present with text
    const snapTxt = norm?.snapshot?.text;
    return typeof snapTxt === 'string' && snapTxt.trim().length > 0;
  }
  return false;
}

// Client-side analysis removed; analysis is performed on the backend.

// Minimal writer: submits only the simplified events list
async function defaultLogWriter({ events, logEndpoint, userId }) {
  if (!logEndpoint || !Array.isArray(events) || !events.length) return;
  const payload = { user_id: userId || getUserIdFromJWT() || '', events };
  try {
    let jwt = '';
    try {
      // Prefer the canonical 'jwt' key; fall back to legacy names if present
      jwt =
        localStorage.getItem('jwt') ||
        localStorage.getItem('token') ||
        localStorage.getItem('auth_token') ||
        '';
    } catch {}
    try { console.debug('LabSessionAnalyzer: POST ->', logEndpoint, 'events:', events.length); } catch {}
    await fetch(logEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    try { console.warn('LabSessionAnalyzer: POST failed', e?.message || e); } catch {}
    // ignore after surfacing once; console payload already logged at flush
  }
}

/**
 * Invisible component that, when mounted, tracks UI events, summarizes with OpenAI, and logs per user.
 *
 * Props:
 * - userId: string (required)
 * - apiKey: string (deprecated; analysis is performed on the backend)
 * - model?: string (deprecated)
 * - enabled?: boolean (default true)
 * - flushIntervalMs?: number (default 15000)
 * - maxBuffer?: number (default 50)
 * - onLog?: async ({ userId, labId, analysis, sample, logEndpoint }) => void
 * - logEndpoint?: string (optional)
 * - consoleOnly?: boolean (default true) when true, aggregates events and logs only the large payload to console at flush time (no network/AI)
 * - labId?: string (optional) lab identifier to include in update payloads
 */
export default function LabSessionAnalyzer({
  userId,
  // apiKey, // deprecated; analysis happens on backend
  // model = DEFAULT_MODEL, // deprecated
  enabled = true,
  flushIntervalMs = 100000,
  maxBuffer = 30000,
  onLog,
  logEndpoint = '/analytics/log',
  consoleOnly = true,
  labId,
}) {
  const bufRef = useRef([]);
  const mountedRef = useRef(false);
  const lastEventTsRef = useRef(0);
  const seqRef = useRef(0);
  const lastEventSigRef = useRef({ sig: '', t: 0 });
  const flushTimerRef = useRef(null);
  const activeInputSessionsRef = useRef(new WeakMap()); // el -> { t0, lastLen, typed }
  const activePointerRef = useRef(new Map()); // pointerId -> t0 (unused after noise reduction)
  const mutationObserverRef = useRef(null); // kept for safe cleanup
  const mediaObserverRef = useRef({ set: new Set(), cleanup: [] }); // kept for safe cleanup
  const perfObserversRef = useRef([]); // kept for safe cleanup
  const dragSessionsRef = useRef(new WeakMap()); // kept for safe cleanup
  const lastSnapshotSigRef = useRef('');
  const lastSnapshotAtRef = useRef(0);
  const prevByTypeRef = useRef(new Map()); // type -> last full text observed

  // apiKey/model unused; analysis moved to backend

  useEffect(() => {
    if (!enabled) return;

    mountedRef.current = true;
    const effectiveUserId = userId || getUserIdFromJWT();

    const add = (type, handler, opts) => document.addEventListener(type, handler, opts);
    const addWin = (type, handler, opts) => window.addEventListener(type, handler, opts);

  const flushBuffer = () => {
    try {
      const toSend = bufRef.current.slice(0);
      bufRef.current.length = 0;
      if (!toSend.length) return;
      if (consoleOnly) {
        try { console.log('LabSessionAnalyzer events', toSend); } catch {}
      } else {
        try {
          const writer = onLog || defaultLogWriter;
          writer({ events: toSend, logEndpoint, userId: effectiveUserId });
        } catch { /* ignore */ }
      }
    } catch { /* noop */ }
  };

  const scheduleFlush = (delayMs = 1000) => {
    try {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushBuffer();
      }, delayMs);
    } catch {}
  };

  const pushEvent = (e) => {
    try {
      const norm = normalizeEvent(e);
      // Flush-only control: allow an ide_input with input.force=true to request a flush (debounced)
  if (norm?.type === 'ide_input' && norm?.input && norm.input.force === true) {
        scheduleFlush(1000);
        return;
      }
      if (!isTextualEvent(norm)) return; // filter non-text events
      const type = norm.type;
      const ts = norm.t;
      const text = (() => {
        if (type === 'terminal_input' || type === 'copilot_input' || type === 'ide_input') {
          return typeof norm?.input?.text === 'string' ? norm.input.text : '';
        }
        const outs = Array.isArray(norm.outputs) ? norm.outputs : [];
        const joined = outs.map(o => (typeof o?.text === 'string' ? o.text : '')).filter(Boolean).join('\n');
        return joined;
      })();
      if (!text || !text.trim()) return;
      const prevFull = prevByTypeRef.current.get(type) || '';
      // Compute delta: if current starts with prev, keep suffix; otherwise find common prefix
      let delta = text;
      if (text.length >= prevFull.length && text.startsWith(prevFull)) {
        delta = text.slice(prevFull.length);
      } else {
        const maxCmp = Math.min(20000, Math.min(text.length, prevFull.length));
        let i = 0;
        while (i < maxCmp && text.charCodeAt(i) === prevFull.charCodeAt(i)) i++;
        if (i > 0) delta = text.slice(i);
      }
      // Update last full text for this type
      prevByTypeRef.current.set(type, text);
      if (!delta || !delta.trim()) return; // no new content

      // Lightweight consecutive duplicate suppression (1.5s window)
      try {
        const contentSig = delta.slice(0, 200);
        const sig = `${type}:${contentSig}`;
        const nowTs = ts || Date.now();
        const last = lastEventSigRef.current;
        if (sig && last.sig === sig && nowTs - (last.t || 0) < 1500) {
          return;
        }
        lastEventSigRef.current = { sig, t: nowTs };
      } catch {}

      const simple = { ts, type, text: sanitizeText(delta, OUTPUT_SNAPSHOT_LIMIT) };

  bufRef.current.push(simple);
      if (bufRef.current.length > maxBuffer * 3) {
        bufRef.current = bufRef.current.slice(-maxBuffer * 3);
      }
  // Debounced submission: flush after 1s of inactivity on any event type
  scheduleFlush(1000);
    } catch {
      // ignore
    }
  };

  // Note: micro-event throttlers removed to reduce noise

    // Helper to attach output snapshots to an event-like object
    const attachOutputs = (evtLike, { onlyIfMissing = true } = {}) => {
      try {
        // Only attach if missing to avoid overwriting source-provided outputs
        if (onlyIfMissing && Array.isArray(evtLike.outputs) && evtLike.outputs.length) return;
        const outputs = collectOutputSnapshots(3);
        if (outputs && outputs.length) evtLike.outputs = outputs;
      } catch {}
    };

    // Helper to attach input snapshots (IDE/editor text) to an event-like object
    const attachInputs = (evtLike) => {
      try {
        const inputs = collectInputSnapshots(2);
        if (inputs && inputs.length) evtLike.inputs = inputs;
      } catch {}
    };

    // Compute a compact signature of a snapshot payload for dedup
    const snapshotSignature = (outputs = [], inputs = []) => {
      try {
        const outSig = outputs.map(o => (o && typeof o.text === 'string' ? o.text.slice(0, 120) : '')).join('|');
        const inSig = inputs.map(i => (i && typeof i.text === 'string' ? i.text.slice(0, 120) : '')).join('|');
        return `${outSig}||${inSig}`;
      } catch { return ''; }
    };

    // Emit a debounced render_snapshot that includes both outputs and inputs, with visibility gating and dedup
    const emitSnapshot = () => {
      try {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        const outputs = collectOutputSnapshots(2);
        const inputs = collectInputSnapshots(2);
        if ((!outputs || !outputs.length) && (!inputs || !inputs.length)) return;
        // Merge inputs into outputs stream with kind tags so they pass filters while remaining distinguishable
        const combined = [
          ...(outputs || []).map(o => ({ ...o, kind: 'output' })),
          ...(inputs || []).map(i => ({ ...i, kind: 'input' })),
        ];
        // Dedup identical consecutive snapshots
        const sig = snapshotSignature(outputs, inputs);
        const nowTs = Date.now();
        if (sig && sig === lastSnapshotSigRef.current && nowTs - (lastSnapshotAtRef.current || 0) < 30000) {
          return; // suppress identical snapshot within 30s
        }
        lastSnapshotSigRef.current = sig;
        lastSnapshotAtRef.current = nowTs;
        pushEvent({ type: 'render_snapshot', outputs: combined });
      } catch { /* noop */ }
    };

    const scheduleSnapshotSoon = debounce(emitSnapshot, 400);

  // DOM listeners (high-value only)
  // Removed click/change/submit listeners to focus solely on text IO
    // Removed noisy listeners: keydown, mousemove, scroll, wheel, resize, selectionchange,
    // contextmenu, clipboard (copy/paste/cut), dragover
  // Custom events from components (e.g., Terminal, Copilot)
  // Wrap handlers to also attach context and schedule on-demand snapshots
  const terminalOutputHandler = (evt) => { /* trust the terminal's payload; don't override */ pushEvent(evt); };
  const terminalInputHandler = (evt) => { pushEvent(evt); scheduleSnapshotSoon(); };
  const copilotOutputHandler = (evt) => { /* trust copilot outputs; optionally add inputs context */ try { attachInputs(evt); } catch {} pushEvent(evt); scheduleSnapshotSoon(); };
  const copilotInputHandler = (evt) => { pushEvent(evt); scheduleSnapshotSoon(); };
  const ideInputHandler = (evt) => { pushEvent(evt); scheduleSnapshotSoon(); };

  add('terminal_output', terminalOutputHandler, true);
  add('terminal_input', terminalInputHandler, true);
  add('copilot_output', copilotOutputHandler, true);
  add('copilot_input', copilotInputHandler, true);
  add('ide_input', ideInputHandler, true);
  // IDE output (custom event from IDE component)
  const ideOutputHandler = (evt) => {
    try { attachOutputs(evt, { onlyIfMissing: true }); attachInputs(evt); } catch {}
    pushEvent(evt);
    scheduleSnapshotSoon();
  };
  add('ide_output', ideOutputHandler, true);

  // Seed an initial session_start event so a flush has something to emit
  // Removed session_start seed (text-only stream)
  // Removed drag and pointer session tracking to reduce noise

    // Track focus/blur sessions and typed char deltas
  // Removed focus/blur/input tracking; rely on explicit terminal/copilot/ide events and snapshots

  // Errors (keep)
  // Removed error/unhandledrejection (non-text noise)
  // Removed DOM mutation/media/perf observers to reduce noise; periodic render snapshots remain

  // Removed interval-based flush/snapshots: event-driven only

    return () => {
      mountedRef.current = false;
      try {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
  // Removed click/change/submit/input listeners
  document.removeEventListener('terminal_output', terminalOutputHandler, true);
  document.removeEventListener('terminal_input', terminalInputHandler, true);
  document.removeEventListener('copilot_output', copilotOutputHandler, true);
  document.removeEventListener('copilot_input', copilotInputHandler, true);
  document.removeEventListener('ide_input', ideInputHandler, true);
  // Removed focus/blur/error/unhandledrejection cleanup
        if (mutationObserverRef.current) {
          try {
            mutationObserverRef.current.disconnect();
          } catch {}
          mutationObserverRef.current = null;
        }
        const mObs = mediaObserverRef.current;
        if (mObs && Array.isArray(mObs.cleanup)) {
          mObs.cleanup.forEach((fn) => {
            try {
              fn();
            } catch {}
          });
          mediaObserverRef.current = { set: new Set(), cleanup: [] };
        }
        if (perfObserversRef.current && perfObserversRef.current.length) {
          perfObserversRef.current.forEach((o) => {
            try {
              o.disconnect();
            } catch {}
          });
          perfObserversRef.current = [];
        }
  // no timers to clear
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId, flushIntervalMs, maxBuffer, onLog, logEndpoint, consoleOnly, labId]);

  // Invisible component
  return null;
}
