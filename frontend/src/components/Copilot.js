import React, { useEffect, useMemo, useRef, useState } from 'react';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

// Small helpers
const collapse = (s = '') => s.replace(/\s+/g, ' ').trim();
const trimTo = (s = '', n = 4000) => (s.length > n ? s.slice(0, n) + '…' : s);
const uniq = (arr) => Array.from(new Set(arr.filter(Boolean).map((s) => collapse(s)))).filter(Boolean);
const DEFAULT_MODEL = 'gpt-4o-mini';
const CONTEXT_BUFFER_MAX = 6000; // configurable rolling buffer size for cross-component context

function extractObjectiveCandidatesFromDOM() {
  const candidates = [];

  // 1) Meta tags
  const meta = document.querySelector(
    'meta[name="objective"], meta[name="x-objective"], meta[property="objective"], meta[name="app:objective"]'
  );
  if (meta?.content) candidates.push(meta.content);

  // 2) Script tags (hidden data/objective)
  const scriptId = document.querySelector('#objective, #hidden-objective, #page-objective');
  if (scriptId?.textContent) candidates.push(scriptId.textContent);

  const scriptType = Array.from(document.querySelectorAll('script[type*="objective"],script[data-objective]'));
  scriptType.forEach((s) => {
    const raw = s.textContent || s.getAttribute('data-objective');
    if (raw) candidates.push(raw);
  });

  // 3) Data attributes
  const dataAttrEl = document.querySelector('[data-objective], [data-goal], [data-page-objective]');
  if (dataAttrEl) {
    const v =
      dataAttrEl.getAttribute('data-objective') ||
      dataAttrEl.getAttribute('data-goal') ||
      dataAttrEl.getAttribute('data-page-objective');
    if (v) candidates.push(v);
  }

  // 4) HTML comments containing "objective"
  try {
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      const val = String(node.nodeValue || '');
      if (/objective/i.test(val)) candidates.push(val);
    }
  } catch {
    // ignore
  }

  // 5) Fallback: look for common hidden nodes
  const hidden = Array.from(document.querySelectorAll('[hidden], [aria-hidden="true"], style, template'));
  hidden.forEach((el) => {
    const t = collapse(el.textContent || '');
    if (/objective/i.test(t)) candidates.push(t);
  });

  return uniq(candidates).map((s) => trimTo(s, 800));
}

function extractHighSignalContext(maxChars = 8000) {
  const url = window.location.href;
  const title = document.title || '';
  const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
  const objectiveCandidates = extractObjectiveCandidatesFromDOM();

  // Headings
  const headings = uniq(
    Array.from(document.querySelectorAll('h1,h2,h3')).map((h) => h.textContent || '')
  ).slice(0, 12);

  // Forms and fields
  const forms = Array.from(document.forms)
    .slice(0, 5)
    .map((f, i) => {
      const fields = Array.from(f.elements || [])
        .slice(0, 15)
        .map((el) => {
          const label =
            el.getAttribute?.('aria-label') ||
            (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
            el.getAttribute?.('placeholder') ||
            el.name ||
            el.type;
          return collapse(label || '');
        })
        .filter(Boolean);
      return `Form#${i + 1}: ${uniq(fields).slice(0, 12).join(', ')}`;
    });

  // Visible text excerpt
  const visibleText = collapse(document.body?.innerText || '');
  const visibleExcerpt = trimTo(visibleText, 2000);

  // Raw HTML excerpt to catch hidden notes/comments
  const rawHTML = document.documentElement?.outerHTML || '';
  const htmlExcerpt = trimTo(rawHTML, 8000);

  const ctx = [
    `URL: ${url}`,
    `Title: ${collapse(title)}`,
    metaDesc ? `Meta Description: ${collapse(metaDesc)}` : null,
    objectiveCandidates.length ? `Objective Candidates: ${objectiveCandidates.length}` : null,
    objectiveCandidates.length ? objectiveCandidates.map((o, i) => `- OBJ#${i + 1}: ${collapse(o)}`).join('\n') : null,
    headings.length ? `Headings:\n- ${headings.join('\n- ')}` : null,
    forms.length ? `Forms:\n- ${forms.join('\n- ')}` : null,
    `Visible Text Excerpt:\n"""${visibleExcerpt}"""`,
    `Raw HTML Excerpt:\n"""${htmlExcerpt}"""`,
  ]
    .filter(Boolean)
    .join('\n');

  // Ensure overall size constraint
  return trimTo(ctx, maxChars);
}

// Try harder to find lab-specific hints like summary/objective/instructions
function extractLabHintsFromDOM(maxChars = 2000) {
  try {
    const candidates = [];
    const selectors = [
      '[data-lab-objective]',
      '[data-lab-summary]',
      '[data-lab-instructions]',
      '.lab-objective',
      '.lab-summary',
      '.lab-instructions',
      '.lesson-objective',
      '.lesson-summary',
      '.lesson-description',
      '#lab-objective',
      '#lab-summary',
      '#instructions',
      'article',
      '[role="main"]',
      'main',
    ];
    const nodes = Array.from(document.querySelectorAll(selectors.join(','))).slice(0, 12);
    nodes.forEach((el) => {
      const t = collapse(el.innerText || el.textContent || '');
      if (!t) return;
      if (/objective|summary|instructions|goal/i.test(t)) candidates.push(t);
    });
    // Also look for nearby text around headings
    Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 8).forEach((h) => {
      const block = collapse((h.nextElementSibling?.innerText || '').slice(0, 1000));
      if (/objective|summary|instructions|goal/i.test(block)) candidates.push(block);
    });
    const uniqd = Array.from(new Set(candidates)).map((s) => trimTo(s, 400));
    const joined = uniqd.length ? `Lab Hints:\n- ${uniqd.join('\n- ')}` : '';
    return trimTo(joined, maxChars);
  } catch {
    return '';
  }
}

function buildSystemPrompt(pageContext) {
  return trimTo(
    [
      'You are a concise, proactive copilot for this specific page.',
      'Use the provided PageContext and hidden objective hints to guide the user.',
      'Keep answers short, impersonal, and actionable. Ask clarifying questions if needed.',
      'If users request tasks unrelated to this page, refocus them on the objective.',
  '',
  'Environment Assumptions:',
  '- The compute/terminal environment is ALWAYS Linux.',
  '- Prefer bash/POSIX-compatible commands and Linux tooling; avoid Windows/macOS-specific instructions.',
  '- Use POSIX paths (/) and typical Linux package/tools; when necessary, mention common alternatives briefly (e.g., apt and yum).',
  '- When presenting shell commands, use a single fenced code block marked with "bash" and do not include a leading "$ " prompt.',
  '- All commands for starting a process need to be bound to 0.0.0.0, e.g., via --host=0.0.0.0',
      'PageContext:',
      pageContext,
    ].join('\n'),
    12000
  );
}

async function chatComplete({ token, provider, model, messages, signal }) {
  const res = await fetch('/llm/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ provider, model: model || DEFAULT_MODEL, messages }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM proxy error ${res.status}: ${text || res.statusText}`);
  }
  const data = await res.json();
  return data?.content || '';
}

export default function Copilot({ containerless = false, onHide }) {
  const [provider, setProvider] = useState('openai');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [objectivePreview, setObjectivePreview] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Lab Assistant ready.' },
  ]);
  const [input, setInput] = useState('');
  const [autoGuideReady, setAutoGuideReady] = useState(false);
  const lastURL = useRef(window.location.href);
  const abortRef = useRef(null);
  const tokenRef = useRef('');
  const containerRef = useRef(null);
  const lastEmitRef = useRef(0);
  const [pageContext, setPageContext] = useState('');
  const observationsRef = useRef([]); // rolling context buffer entries
  const lastOutputHashesRef = useRef(new Set()); // to avoid duplicating identical observations
  const md = useMemo(() => {
    const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
    return new MarkdownIt({
      html: false,
      linkify: true,
      breaks: true,
      highlight: (str, lang) => {
        try {
          if (lang && hljs.getLanguage(lang)) {
            const out = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
            return `<pre><code class="hljs language-${lang}">${out}</code></pre>`;
          }
          const out = hljs.highlightAuto(str).value;
          return `<pre><code class="hljs">${out}</code></pre>`;
        } catch {
          return `<pre><code>${escapeHtml(str)}</code></pre>`;
        }
      },
    });
  }, []);

  // Detect presence of IDE and Terminal so we only show valid action buttons
  const [targets, setTargets] = useState({ ide: false, terminal: false });
  useEffect(() => {
    const detect = () => {
      const hasIDE = !!document.querySelector('[data-component="ide"], .ide-output');
      const hasTerm = !!document.querySelector('[data-component="terminal"], .terminal-output');
      setTargets({ ide: hasIDE, terminal: hasTerm });
    };
    detect();
    const iv = setInterval(detect, 1000);
    return () => clearInterval(iv);
  }, []);

  // Helpers to parse code fences and decide if it's a shell command
  const extractFirstCodeBlock = (text = '') => {
    const fence = text.match(/```([a-zA-Z0-9+-]*)\n([\s\S]*?)```/);
    if (!fence) return { lang: '', code: '' };
    const lang = (fence[1] || '').toLowerCase();
    const code = (fence[2] || '').trim();
    return { lang, code };
  };
  const extractAllCodeBlocks = (text = '') => {
    const re = /```([a-zA-Z0-9+-]*)\n([\s\S]*?)```/g;
    const blocks = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      const lang = (m[1] || '').toLowerCase();
      const code = (m[2] || '').trim();
      blocks.push({ lang, code });
    }
    return blocks;
  };
  const isShellLang = (lang = '') => /^(bash|sh|shell|zsh|fish|console)$/i.test(lang);
  const looksLikeShell = (code = '') => {
    if (!code) return false;
    const lines = code.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return false;
    // Shebang
    if (/^#!\s*\/(usr\/bin\/)?(env\s+)?(bash|sh|zsh|fish)/.test(lines[0])) return true;
    // Prompted lines or common shell tokens
    if (lines.some((l) => l.startsWith('$ ') || / && |\|\||\|/.test(l))) return true;
    // Common command starters
    const common = /^(cd|ls|pwd|cat|echo|curl|wget|git|npm|pnpm|yarn|pip|python|node|go|make|chmod|chown|kubectl|docker|helm|tar|unzip|apt|yum|brew)\b/;
    if (lines.some((l) => common.test(l.replace(/^\$\s*/, '')))) return true;
    return false;
  };
  const sanitizeShell = (code = '') => {
    // Drop comments and leading "$ " prompts; keep line breaks
    return code
      .split(/\r?\n/)
      .map((l) => l.replace(/^\$\s*/, '').replace(/^#.*$/, '').trim())
      .filter(Boolean)
      .join('\n');
  };

  const getObservationText = () => {
    const joined = observationsRef.current.join('\n');
    return joined.slice(-CONTEXT_BUFFER_MAX);
  };
  const addObservation = (label, rawText) => {
    try {
      const text = sanitizeText(String(rawText || ''), 1000);
      if (!text) return;
      // dedupe via simple hash (preview+len)
      const sig = `${label}|${text.slice(0, 200)}|${text.length}`;
      const set = lastOutputHashesRef.current;
      if (set.has(sig)) return;
      set.add(sig);
      // prune set to reasonable size
      if (set.size > 100) {
        // drop roughly oldest entries: recreate with last 50
        const arr = Array.from(set);
        lastOutputHashesRef.current = new Set(arr.slice(-50));
      }
      const entry = `${label}: ${text}`;
      observationsRef.current.push(entry);
      // Trim by char limit
      let joined = observationsRef.current.join('\n');
      if (joined.length > CONTEXT_BUFFER_MAX) {
        // drop oldest until within limit
        while (observationsRef.current.length && joined.length > CONTEXT_BUFFER_MAX) {
          observationsRef.current.shift();
          joined = observationsRef.current.join('\n');
        }
      }
    } catch {}
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

  const emitCopilotSnapshot = () => {
    try {
      const now = Date.now();
      if (now - lastEmitRef.current < 800) return; // throttle
      const el = containerRef.current;
      if (!el) return;
      const raw = el.innerText || '';
      const text = sanitizeText(raw);
      if (!text) return;
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
          },
        ],
      };
      const evt = new CustomEvent('copilot_output', { detail, bubbles: true, composed: true });
      el.dispatchEvent(evt);
      lastEmitRef.current = now;
    } catch {
      // ignore
    }
  };

  // Emit a sanitized input event when the user sends a message
  const emitCopilotInput = (raw) => {
    try {
      const text = sanitizeText(String(raw || ''));
      if (!text) return;
      const detail = {
        input: {
          text,
          len: String(raw || '').length,
          lines: (String(raw || '').match(/\n/g) || []).length + 1,
        },
      };
      const target = containerRef.current || document;
      const evt = new CustomEvent('copilot_input', { detail, bubbles: true, composed: true });
      target.dispatchEvent(evt);
    } catch {
      // ignore
    }
  };

  const refreshPageContext = () => {
    try {
      const ctx = extractHighSignalContext();
      const hints = extractLabHintsFromDOM();
      const obj = extractObjectiveCandidatesFromDOM()[0] || '';
      setObjectivePreview(obj ? trimTo(obj, 200) : '');
      setPageContext([ctx, hints].filter(Boolean).join('\n'));
    } catch {
      setPageContext('Failed to extract page context.');
    }
  };
  useEffect(() => {
    refreshPageContext();
    // Seed initial observations with lab hints if any
    const hints = extractLabHintsFromDOM();
    if (hints) addObservation('Hints', hints);
    // Listen to cross-component outputs and add to observations
    const onTerm = (e) => {
      try {
        const outs = e?.detail?.outputs || [];
        outs.forEach((o) => addObservation('Terminal', o?.text || ''));
      } catch {}
    };
    const onIDE = (e) => {
      try {
        const outs = e?.detail?.outputs || [];
        outs.forEach((o) => addObservation('IDE', o?.text || ''));
      } catch {}
    };
    const onTermInput = (e) => {
      try {
        const txt = e?.detail?.input?.text || e?.input?.text || '';
        if (txt) addObservation('TerminalInput', txt);
      } catch {}
    };
    const onCopilotOut = () => {
      // optionally remember assistant answers to keep continuity
      try {
        const el = containerRef.current;
        const raw = el?.innerText || '';
        if (raw) addObservation('Copilot', raw.slice(-800));
      } catch {}
    };
  document.addEventListener('terminal_output', onTerm, true);
  document.addEventListener('ide_output', onIDE, true);
  document.addEventListener('terminal_input', onTermInput, true);
  document.addEventListener('copilot_output', onCopilotOut, true);
  // Also listen at window in case events are dispatched there
  window.addEventListener('terminal_output', onTerm, true);
  window.addEventListener('ide_output', onIDE, true);
  window.addEventListener('terminal_input', onTermInput, true);
  window.addEventListener('copilot_output', onCopilotOut, true);

    // Fallback: periodic DOM scan for terminal/IDE/log outputs
    const scanSelectors = [
      '.terminal-output',
      '.ide-output',
      '#terminal',
      '[role="log"]',
    ];
    const ivScan = setInterval(() => {
      try {
        const nodes = Array.from(document.querySelectorAll(scanSelectors.join(','))).slice(0, 8);
        nodes.forEach((el) => {
          const text = (el.innerText || el.textContent || '').trim();
          if (!text) return;
          const label = el.classList?.contains('terminal-output') ? 'Terminal' : (el.classList?.contains('ide-output') ? 'IDE' : 'Output');
          addObservation(label, text);
        });
      } catch {}
    }, 3000);

    return () => {
  document.removeEventListener('terminal_output', onTerm, true);
  document.removeEventListener('ide_output', onIDE, true);
  document.removeEventListener('terminal_input', onTermInput, true);
  document.removeEventListener('copilot_output', onCopilotOut, true);
  window.removeEventListener('terminal_output', onTerm, true);
  window.removeEventListener('ide_output', onIDE, true);
  window.removeEventListener('terminal_input', onTermInput, true);
  window.removeEventListener('copilot_output', onCopilotOut, true);
      clearInterval(ivScan);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // If URL changes, auto-rescan and propose guidance.
    const iv = setInterval(() => {
      if (window.location.href !== lastURL.current) {
  lastURL.current = window.location.href;
  refreshPageContext();
  setAutoGuideReady(true);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (autoGuideReady) {
      proposeGuidance();
      setAutoGuideReady(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGuideReady]);

  useEffect(() => {
    // Read JWT from local storage (non-admin flow)
    tokenRef.current = localStorage.getItem('jwt') || '';
    // Also update on storage events from other tabs
    const onStorage = (e) => {
      if (e.key === 'jwt') tokenRef.current = e.newValue || '';
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Configuration for provider keys should be done elsewhere in the org portal.

  async function proposeGuidance() {
  if (!tokenRef.current) return;
    setLoading(true);
    setError('');
    const contextBuffer = getObservationText();
    const sys = buildSystemPrompt([
      pageContext,
      contextBuffer ? `RecentObservations:\n${contextBuffer}` : null,
    ].filter(Boolean).join('\n'));
    const base = [{ role: 'system', content: sys }];

    try {
      abortRef.current?.abort?.();
      abortRef.current = new AbortController();

      const content = await chatComplete({
        token: tokenRef.current,
        provider,
        model: DEFAULT_MODEL,
        messages: [
          ...base,
          {
            role: 'user',
            content:
              'Based on the PageContext and hidden objective, provide 3–5 short, actionable guidance bullets to move forward.',
          },
        ],
        signal: abortRef.current.signal,
      });

      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Analyzing page and objective…' },
        { role: 'assistant', content },
      ]);
  // Emit a snapshot after messages update tick
  setTimeout(emitCopilotSnapshot, 0);
    } catch (e) {
      setError(e.message || 'Failed to generate guidance.');
    } finally {
      setLoading(false);
    }
  }

  async function send() {
  if (!input.trim()) return;
  // Emit input event before any state changes/network calls
  emitCopilotInput(input);
  if (!tokenRef.current) {
      setMessages((m) => [...m, { role: 'user', content: input }]);
      setInput('');
      return;
    }

    setLoading(true);
    setError('');
    const contextBuffer = getObservationText();
    const sys = buildSystemPrompt([
      pageContext,
      contextBuffer ? `RecentObservations:\n${contextBuffer}` : null,
    ].filter(Boolean).join('\n'));
    const history = messages
      .slice(-10) // keep it short
      .map((m) => ({ role: m.role, content: m.content }));
    const convo = [{ role: 'system', content: sys }, ...history, { role: 'user', content: input }];

    try {
      abortRef.current?.abort?.();
      abortRef.current = new AbortController();

  const content = await chatComplete({ token: tokenRef.current, provider, model: DEFAULT_MODEL, messages: convo, signal: abortRef.current.signal });

  setMessages((m) => [...m, { role: 'user', content: input }, { role: 'assistant', content }]);
  setTimeout(emitCopilotSnapshot, 0);
      setInput('');
    } catch (e) {
      setError(e.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  }

  function rescan() {
    // Recompute memo by toggling a state that depends on saved and URL, then propose guidance.
  refreshPageContext();
  setAutoGuideReady(true);
  }

  const [selectedBlocks, setSelectedBlocks] = useState({}); // messageIndex -> selected block index

  const msgRefs = useRef({});
  const setMsgRef = (i) => (el) => {
    if (el) msgRefs.current[i] = el; else delete msgRefs.current[i];
  };

  // Delegate clicks on <pre> blocks to select them and update highlight
  const onMessageClick = (i, e) => {
    try {
      const container = msgRefs.current[i];
      if (!container) return;
      const pre = e.target.closest && e.target.closest('pre');
      if (!pre || !container.contains(pre)) return;
      const list = Array.from(container.querySelectorAll('pre'));
      const idx = list.indexOf(pre);
      if (idx >= 0) setSelectedBlocks((m) => ({ ...m, [i]: idx }));
    } catch {}
  };

  // Highlight selected block per message
  useEffect(() => {
    try {
      Object.entries(msgRefs.current).forEach(([k, el]) => {
        const i = Number(k);
        const sel = selectedBlocks[i] ?? 0;
        const pres = Array.from(el.querySelectorAll('pre'));
        pres.forEach((p, j) => {
          p.classList.add('cursor-pointer');
          p.classList.add('transition');
          p.classList.add('ring-1');
          p.classList.add('ring-transparent');
          p.classList.add('rounded');
          // Clear any previous highlight styles
          p.classList.remove('ring-2');
          p.classList.remove('ring-sky-500');
          p.classList.remove('ring-offset-2');
          p.classList.remove('ring-offset-white');
          p.classList.remove('shadow-sm');
          p.classList.remove('shadow-md');
          p.classList.remove('bg-sky-50');
          p.classList.remove('dark:ring-sky-400');
          p.classList.remove('dark:ring-offset-slate-900');
          p.classList.remove('dark:bg-slate-800/60');
          if (j === sel) {
            p.classList.add('ring-2');
            p.classList.add('ring-sky-500');
            p.classList.add('ring-offset-2');
            p.classList.add('ring-offset-white');
            p.classList.add('shadow-md');
            p.classList.add('bg-sky-50');
            p.classList.add('dark:ring-sky-400');
            p.classList.add('dark:ring-offset-slate-900');
            p.classList.add('dark:bg-slate-800/60');
          }
        });
      });
    } catch {}
  }, [messages, selectedBlocks]);

  return (
    <div
      className={
        containerless
          ? 'w-full h-full flex flex-col'
          : 'w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900'
      }
      data-nosnapshot
    >
      <div className={`flex items-center gap-2 border-b p-3 ${containerless ? 'border-slate-200 dark:border-slate-800' : 'border-slate-200 dark:border-slate-800'}`}>
  <strong className="text-slate-900 dark:text-slate-100">Lab Assistant</strong>
        <div className="flex-1" />
        {/* Hide icon appears when parent provides onHide */}
        {typeof onHide === 'function' && (
          <button
            type="button"
            onClick={onHide}
            className={`inline-flex items-center justify-center text-xs p-2 rounded-md transition-colors ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              'dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-700 dark:focus:ring-sky-500 dark:focus:ring-offset-slate-900 bg-white text-slate-800 ring-slate-300 hover:bg-slate-50 focus:ring-sky-500 focus:ring-offset-slate-50'
            }`}
            aria-label="Hide Lab Assistant"
            title="Hide Lab Assistant"
          >
            {/* Chevron-left icon */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="sr-only">Hide</span>
          </button>
        )}
        <button
          type="button"
          onClick={rescan}
          disabled={loading}
          className={`inline-flex items-center justify-center text-xs p-2 rounded-md transition-colors ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            'dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-700 dark:focus:ring-sky-500 dark:focus:ring-offset-slate-900 bg-white text-slate-800 ring-slate-300 hover:bg-slate-50 focus:ring-sky-500 focus:ring-offset-slate-50'
          } disabled:opacity-50 ml-1`}
          aria-label="Rescan page"
          title="Rescan page context"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
          ) : (
            // Refresh icon
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v6h6M20 20v-6h-6" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 10a8 8 0 0113.657-5.657L20 6M20 14a8 8 0 01-13.657 5.657L4 18" />
            </svg>
          )}
          <span className="sr-only">Rescan</span>
        </button>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800">
        <div ref={containerRef} className="flex max-h-80 flex-col gap-3 overflow-y-auto p-3 copilot-output">
          {messages.map((m, i) => {
            const isAssistant = m.role === 'assistant';
            const content = m.content || '';
            const codeLike = /```[a-zA-Z0-9]*[\s\S]*?```/.test(content) || /\b(class|def|function|const|let|package|import)\b/.test(content);
            const allBlocks = extractAllCodeBlocks(content);
            const selIdx = Math.min(Math.max(0, selectedBlocks[i] ?? 0), Math.max(0, allBlocks.length - 1));
            const fallback = extractFirstCodeBlock(content);
            const sel = allBlocks[selIdx] || fallback;
            const isCommandBlock = !!sel.code && (isShellLang(sel.lang) || looksLikeShell(sel.code));
            const handleInsertIDE = () => {
              try {
                let snippet = sel?.code || '';
                if (!snippet) {
                  // Fallback to first fenced block from content if selection empty
                  const match = content.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
                  if (match) snippet = match[1];
                }
                const detail = { content: snippet };
                const evt = new CustomEvent('copilot_code_suggestion', { detail, bubbles: true, composed: true });
                document.dispatchEvent(evt);
              } catch {}
            };
            const handleRunTerminal = () => {
              try {
                if (!isCommandBlock) return;
                const cmd = sanitizeShell(sel.code).trim();
                if (!cmd) return;
                const detail = { command: cmd };
                const evt = new CustomEvent('copilot_terminal_command', { detail, bubbles: true, composed: true });
                document.dispatchEvent(evt);
              } catch {}
            };
            if (isAssistant) {
              return (
                <div
                  key={i}
                  className="max-w-none self-start"
                  ref={setMsgRef(i)}
                  onClick={(e) => onMessageClick(i, e)}
                >
                  {codeLike && (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {targets.ide && (
                        <button
                          onClick={handleInsertIDE}
                          className="inline-flex items-center rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white shadow hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          title="Insert selected code block into editor"
                          aria-label="Insert code into IDE"
                        >
                          Insert into IDE
                        </button>
                      )}
                      {targets.terminal && (
                        <button
                          onClick={handleRunTerminal}
                          disabled={!isCommandBlock}
                          className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium text-white shadow focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                            isCommandBlock ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-400 opacity-60 cursor-not-allowed'
                          }`}
                          title={isCommandBlock ? 'Run selected code in Terminal' : 'Selected block is not a shell command'}
                          aria-label="Run in Terminal"
                        >
                          Run in Terminal
                        </button>
                      )}
                    </div>
                  )}
                  <div className="prose prose-slate prose-sm max-w-none dark:prose-invert">
                    <div dangerouslySetInnerHTML={{ __html: md.render(content) }} />
                  </div>
                </div>
              );
            }
            return (
              <div
                key={i}
                className="self-end max-w-[80%] whitespace-pre-wrap rounded-lg bg-sky-100 px-3 py-2 text-slate-900 shadow dark:bg-sky-900/40 dark:text-slate-100"
              >
                {content}
              </div>
            );
          })}
        </div>

    <div className={`border-t p-3 ${containerless ? 'border-slate-200 dark:border-slate-800' : 'border-slate-200 dark:border-slate-800'}`}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={'Ask for help…'}
              disabled={loading}
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              className="inline-flex items-center rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              onClick={send}
              disabled={loading || !input.trim()}
            >
              Send
            </button>
          </div>
          {loading ? <div className="mt-2 text-sm text-slate-500">Working…</div> : null}
          {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
