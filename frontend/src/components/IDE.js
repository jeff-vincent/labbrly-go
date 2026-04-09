import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import FileExplorer from './FileExplorer';
import Terminal from './Terminal';

const IDE = ({ labData, showExplorer = true, showEmbeddedTerminal = false, embeddedTerminalText = '' }) => {
  console.log('IDE: Component initialized with labData:', labData);
  
  const [fileContent, setFileContent] = useState('');
  const [outputText, setOutputText] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [lessonName, setLessonName] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const editorRef = useRef(null);
  const [undoStack, setUndoStack] = useState([]); // previous file contents
  const [showUndo, setShowUndo] = useState(false); // show undo bar after replacement
  // Tabs state: array of { path, content, language } and active index
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(-1);
  const [dirtyMap, setDirtyMap] = useState({}); // path -> boolean
  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  // Resizable Explorer width (persisted)
  const [explorerWidth, setExplorerWidth] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem('ide-explorer-width') || '', 10);
      return Number.isFinite(v) && v >= 160 ? v : 256; // default ~w-64
    } catch { return 256; }
  });
  const [explorerDragging, setExplorerDragging] = useState(false);
  const explorerDragRef = useRef({ startX: 0, startW: 256 });
  const minExplorerWidth = 160;
  const getMaxExplorerWidth = () => Math.round(window.innerWidth * 0.6);
  const clampExplorerWidth = (w) => Math.max(minExplorerWidth, Math.min(w, getMaxExplorerWidth()));
  // Start explorer resize drag (shared by both visible and overlay handles)
  const startExplorerResize = (e) => {
    if (!showExplorer) return;
    setExplorerDragging(true);
    explorerDragRef.current = { startX: e.clientX, startW: explorerWidth, latestW: explorerWidth };
    const move = (ev) => {
      const dx = ev.clientX - explorerDragRef.current.startX;
      const next = clampExplorerWidth(explorerDragRef.current.startW + dx);
      explorerDragRef.current.latestW = next;
      setExplorerWidth(next);
    };
    const up = () => {
      setExplorerDragging(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      try { localStorage.setItem('ide-explorer-width', String(explorerDragRef.current.latestW ?? explorerWidth)); } catch {}
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Keyboard support for Explorer resizer
  const onExplorerKeyDown = (e) => {
    const step = e.shiftKey ? 50 : 10;
    let handled = false;
    if (e.key === 'ArrowLeft') {
      setExplorerWidth((w) => clampExplorerWidth(w - step));
      handled = true;
    } else if (e.key === 'ArrowRight') {
      setExplorerWidth((w) => clampExplorerWidth(w + step));
      handled = true;
    } else if (e.key === 'Home') {
      setExplorerWidth(minExplorerWidth);
      handled = true;
    } else if (e.key === 'End') {
      setExplorerWidth(getMaxExplorerWidth());
      handled = true;
    }
    if (handled) {
      e.preventDefault();
      try { localStorage.setItem('ide-explorer-width', String(clampExplorerWidth(explorerWidth))); } catch {}
    }
  };

  // Persist explorer width when it changes (covers keyboard interaction)
  useEffect(() => {
    try { localStorage.setItem('ide-explorer-width', String(explorerWidth)); } catch {}
  }, [explorerWidth]);

  // Output panel state: resizable/collapsible with persistence
  const [outputCollapsed, setOutputCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ide-output-collapsed') || 'false');
    } catch {
      return false;
    }
  });
  const [outputHeight, setOutputHeight] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem('ide-output-height') || '', 10);
      return Number.isFinite(v) && v > 60 ? v : 200; // default 200px
    } catch {
      return 200;
    }
  });
  const dragStateRef = useRef({ dragging: false, startY: 0, startH: 200 });
  const onResizeMouseDown = (e) => {
    e.preventDefault();
    dragStateRef.current = { dragging: true, startY: e.clientY, startH: outputHeight };
    window.addEventListener('mousemove', onResizeMouseMove);
    window.addEventListener('mouseup', onResizeMouseUp, { once: true });
  };
  const onResizeMouseMove = (e) => {
    const { dragging, startY, startH } = dragStateRef.current;
    if (!dragging) return;
    const dy = startY - e.clientY; // drag up => increase height
    let nh = Math.max(80, Math.min(startH + dy, Math.round(window.innerHeight * 0.6)));
    setOutputHeight(nh);
  };
  const onResizeMouseUp = () => {
    dragStateRef.current.dragging = false;
    window.removeEventListener('mousemove', onResizeMouseMove);
  };
  useEffect(() => {
    try { localStorage.setItem('ide-output-height', String(outputHeight)); } catch {}
  }, [outputHeight]);
  useEffect(() => {
    try { localStorage.setItem('ide-output-collapsed', JSON.stringify(outputCollapsed)); } catch {}
  }, [outputCollapsed]);

  // Theme state with persistence
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('ide-theme') || 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('ide-theme', theme);
    } catch {}
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // Debounce helper for IDE input emission
  const debounce = (fn, wait) => {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const sanitizeForEmit = (s, limit = 5000) => {
    if (typeof s !== 'string') return '';
    try {
      let t = s.replace(/\r\n?/g, '\n');
      t = t.replace(/\bhttps?:\/\/\S+|\bwww\.[^\s]+/gi, '[URL]');
      t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]');
      t = t.replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[TOKEN]');
      t = t.replace(/\bsk-[A-Za-z0-9]{16,}\b/gi, '[SECRET]');
      t = t.replace(/\bghp_[A-Za-z0-9]{20,}\b/gi, '[SECRET]');
      t = t.replace(/[A-Fa-f0-9]{24,}/g, '[HEX]');
      t = t.replace(/\d{6,}/g, '[NUM]');
      return t.slice(0, limit);
    } catch {
      return (s || '').toString().slice(0, limit);
    }
  };

  // Debounced emitter for IDE input during user typing
  const emitIDEInput = useRef(null);
  if (!emitIDEInput.current) {
    emitIDEInput.current = debounce((raw) => {
      try {
        const text = sanitizeForEmit(String(raw || ''));
        if (!text.trim()) return;
        const detail = { input: { text, len: String(raw || '').length, lines: (String(raw || '').match(/\n/g) || []).length + 1 } };
        document.dispatchEvent(new CustomEvent('ide_input', { detail }));
      } catch {}
    }, 800);
  }

  // Function to determine language configuration based on execution_command
  const getLanguageConfig = (executionCommand) => {
    if (!executionCommand) return { mode: 'python', title: 'Python Editor' };
    
    const command = executionCommand.toLowerCase();
    
    if (command.includes('node')) {
      return { mode: 'javascript', title: 'Node Editor' };
    } else if (command.includes('go')) {
      return { mode: 'go', title: 'Go Editor' };
    } else {
      return { mode: 'python', title: 'Python Editor' };
    }
  };

  const languageConfig = getLanguageConfig(labData?.execution_command);

  // Infer language from file extension; fallback to languageConfig.mode
  const inferLanguageFromPath = (path) => {
    const ext = (path?.split('.').pop() || '').toLowerCase();
    if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'javascript';
    if (ext === 'ts') return 'typescript';
    if (ext === 'py') return 'python';
    if (ext === 'go') return 'go';
    if (ext === 'sh' || ext === 'bash') return 'shell';
    return languageConfig.mode;
  };

  useEffect(() => {
    console.log('IDE: useEffect triggered with labData:', labData);
    
    if (labData) {
      console.log('IDE: Setting up component with data:');
      console.log('  - example_code:', labData.example_code);
      console.log('  - expected_output:', labData.expected_output);
      console.log('  - name:', labData.name);
      console.log('  - execution_command:', labData.execution_command);
      console.log('  - script_name:', labData.script_name);
      
  setFileContent(labData.example_code || '');
      setExpectedOutput((labData.expected_output || '').replace(/'/g, ''));
      setLessonName(labData.name || '');

      // Create and open initial file tab using provided script_name and example code
      const initialPath = labData.script_name || 'main.py';
      const initialLang = inferLanguageFromPath(initialPath);
      setTabs([{ path: initialPath, content: labData.example_code || '', language: initialLang }]);
      setActiveTab(0);
      setDirtyMap({ [initialPath]: false });

      // Persist the example code into the user's environment immediately
      // Avoid network side-effects during unit tests
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        (async () => {
          try {
            const token = localStorage.getItem('jwt');
            const headers = token
              ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
              : { 'Content-Type': 'application/json' };
            await fetch('/compute/fs/create', {
              method: 'POST',
              headers,
              body: JSON.stringify({ path: initialPath, content: labData.example_code || '' }),
            });
          } catch (e) {
            console.error('Failed to write initial example file:', e);
          }
        })();
      }
    } else {
      console.log('IDE: No labData provided');
    }
  }, [labData]);

  const handleFileContentChange = (value) => {
    setFileContent(value);
  };

  const handleRunCode = async () => {
    setLoading(true);

    // Emit a user-input snapshot before running to trigger analytics flush
    try {
      const editor = editorRef.current;
      const raw = (editor && editor.getValue && editor.getValue()) ?? fileContent ?? '';
      const text = sanitizeForEmit(String(raw));
      if (text && text.trim()) {
        const detail = { input: { text, len: String(raw).length, lines: (String(raw).match(/\n/g) || []).length + 1 } };
        document.dispatchEvent(new CustomEvent('ide_input', { detail }));
      }
    } catch {}

    const formData = new FormData();
    formData.append('script', fileContent);
    // Use the visible file name (active tab) as the executable/script name
    const currentPath = tabs[activeTab]?.path || labData?.script_name || '';
    const visibleFileName = currentPath ? currentPath.split('/').slice(-1)[0] : '';
    formData.append('script_name', visibleFileName || null);
    formData.append('execution_command', labData?.execution_command || null);
    const accessToken = localStorage.getItem('jwt');
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };

    try {
      const response = await fetch(`/compute/run`, {
        method: 'POST',
        body: formData,
        headers: headers,
      });

      if (response.ok) {
        const rawContent = await response.text();
        setOutputText(rawContent);
        try {
          const text = String(rawContent || '').slice(0, 2000);
          const detail = {
            outputs: [
              {
                tag: 'div',
                id: '',
                classes: ['ide-output'],
                role: 'log',
                text,
                len: text.length,
                lines: (text.match(/\n/g) || []).length + 1,
              },
            ],
          };
          document.dispatchEvent(new CustomEvent('ide_output', { detail }));
          // Immediately request analytics flush (flush-only event)
          try {
            document.dispatchEvent(new CustomEvent('ide_input', { detail: { input: { text: '', force: true } } }));
          } catch {}
        } catch {}
        const podTerminated = "Error from server (NotFound):";
        // Surface a helpful message if the pod/exec session is gone
        if (rawContent.includes(podTerminated)) {
          setOutputText("Your cloud environment needs to be restarted. Copy any code you'd like to save and refresh your browser to continue.");
        }
        // Compare normalized plain text (ignore CRLF and surrounding spaces)
        const normOut = (rawContent || '').replace(/\r\n/g, '\n').trim();
        const normExpected = (expectedOutput || '').replace(/\r\n/g, '\n').trim();
        if (normOut === normExpected && normExpected) setShowModal(true);
      } else {
        const errText = await response.text().catch(() => 'Failed to run code.');
        setOutputText(errText || 'Failed to run code.');
        throw new Error('Failed to run code.');
      }
    } catch (error) {
      console.error('Error running code:', error);
    } finally {
      setLoading(false);
    }
  };

  // File open function: fetch content from compute fs and open as a new tab
  const openFileInTab = async (path) => {
    try {
      const accessToken = localStorage.getItem('jwt');
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const u = new URL('/compute/fs/read', window.location.origin);
      u.searchParams.set('path', path);
      const res = await fetch(u.toString(), { headers });
      let content = '';
      if (res.headers.get('content-type')?.includes('application/json')) {
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || 'Failed to read file');
        content = String(j || '');
      } else {
        content = await res.text();
        if (!res.ok) throw new Error(content || 'Failed to read file');
      }

      // Infer language from extension
      const ext = (path.split('.').pop() || '').toLowerCase();
      const lang = ext === 'js' || ext === 'mjs' || ext === 'cjs' ? 'javascript'
        : ext === 'ts' ? 'typescript'
        : ext === 'py' ? 'python'
        : ext === 'go' ? 'go'
        : ext === 'sh' || ext === 'bash' ? 'shell'
        : languageConfig.mode;

      setTabs((prev) => {
        const existing = prev.findIndex(t => t.path === path);
        if (existing !== -1) {
          setActiveTab(existing);
          return prev;
        }
        const next = [...prev, { path, content, language: lang }];
        setActiveTab(next.length - 1);
        return next;
      });
      // Also load content into the single-file editor for run
      setFileContent(content);
    } catch (e) {
      console.error('Failed to open file:', e);
    }
  };

  const updateActiveTabContent = (value) => {
    if (activeTab < 0) return;
  setTabs((prev) => prev.map((t, i) => (i === activeTab ? { ...t, content: value } : t)));
  const p = tabs[activeTab]?.path;
  if (p) setDirtyMap((m) => ({ ...m, [p]: true }));
  };

  const closeTab = (idx) => {
    setTabs((prev) => prev.filter((_, i) => i !== idx));
    setActiveTab((cur) => {
      if (idx < cur) return cur - 1;
      if (idx === cur) return Math.max(0, cur - 1);
      return cur;
    });
    // Clear dirty flag for closed tab
    const p = tabs[idx]?.path;
    if (p) setDirtyMap((m) => {
      const n = { ...m };
      delete n[p];
      return n;
    });
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  console.log('IDE: Rendering component');

  // Lock body scroll when expanded
  useEffect(() => {
    if (isExpanded) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isExpanded]);

  // Listen for Copilot code suggestion insert events and insert into active editor at cursor
  useEffect(() => {
    const handler = (e) => {
      try {
        const snippetRaw = e?.detail?.content;
        if (!snippetRaw) return;
        const cleaned = String(snippetRaw).replace(/\s+$/, '') + '\n';

        const ed = editorRef.current;
        const model = ed?.getModel?.();
        // Capture current content snapshot for Undo bar
        const current = model?.getValue?.() ?? (tabs[activeTab]?.content ?? fileContent);
        setUndoStack((stk) => [...stk.slice(-9), current]);

        if (ed && model) {
          // Insert/replace at current selection
          const sel = ed.getSelection?.();
          const range = sel || { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
          ed.executeEdits('copilot-insert', [{ range, text: cleaned, forceMoveMarkers: true }]);
          ed.focus?.();
          // Reveal the end of the inserted range
          const pos = ed.getPosition?.();
          if (pos) ed.revealPositionInCenter?.(pos);
          setShowUndo(true);
        } else {
          // Fallback: prepend to current buffer
          const next = cleaned + current;
          setFileContent(next);
          updateActiveTabContent(next);
          setShowUndo(true);
        }

        // Emit ide_input event reflecting the inserted snippet (limited)
        try {
          const text = cleaned.slice(0, 5000);
          const detail = { input: { text, len: text.length, lines: (text.match(/\n/g) || []).length + 1 } };
          document.dispatchEvent(new CustomEvent('ide_input', { detail }));
        } catch {}
      } catch {}
    };
    document.addEventListener('copilot_code_suggestion', handler, true);
    return () => {
      document.removeEventListener('copilot_code_suggestion', handler, true);
    };
  }, [activeTab, tabs, fileContent]);

  const undoReplace = () => {
    setShowUndo(false);
    setFileContent((prev) => {
      const last = undoStack[undoStack.length - 1];
      if (last === undefined) return prev;
      setUndoStack((stk) => stk.slice(0, -1));
      return last;
    });
    setTimeout(() => {
      const ed = editorRef.current;
      if (ed?.focus) ed.focus();
    }, 30);
  };

  const toggleExpand = () => setIsExpanded(e => !e);
  // Debounced autosave for active tab (1.5s of inactivity)
  useEffect(() => {
    if (activeTab < 0) return;
    const t = tabs[activeTab];
    if (!t?.path) return;
    const isDirty = !!dirtyMap[t.path];
    if (!isDirty) return;
    const handle = setTimeout(async () => {
      try {
        setAutoSaving(true);
        const token = localStorage.getItem('jwt');
        const headers = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
        await fetch('/compute/fs/create', {
          method: 'POST',
          headers,
          body: JSON.stringify({ path: t.path, content: t.content || '' }),
        });
        setDirtyMap((m) => ({ ...m, [t.path]: false }));
      } catch {}
      finally { setAutoSaving(false); }
    }, 1500);
    return () => clearTimeout(handle);
  }, [activeTab, tabs, dirtyMap]);

  // Immediate save after paste: listen to Monaco's onDidPaste or capture paste events
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    // Handler to force immediate save after content updates caused by paste
    const handlePaste = async () => {
      if (activeTab < 0) return;
      const t = tabs[activeTab];
      if (!t?.path) return;
      // Mark dirty (it already should be from onChange) and save immediately
      try {
        setAutoSaving(true);
        const token = localStorage.getItem('jwt');
        const headers = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
        await fetch('/compute/fs/create', {
          method: 'POST',
          headers,
          body: JSON.stringify({ path: t.path, content: editor.getValue() || '' }),
        });
        setDirtyMap((m) => ({ ...m, [t.path]: false }));
      } catch (e) {
        console.error('Immediate paste save failed:', e);
      } finally {
        setAutoSaving(false);
      }
    };
    // Monaco provides onDidPaste; if not present, fallback to DOM paste listener
    const disposable = editor.onDidPaste ? editor.onDidPaste(handlePaste) : null;
    const domNode = editor.getDomNode?.();
    if (!disposable && domNode) {
      domNode.addEventListener('paste', handlePaste, true);
    }
    return () => {
      if (disposable) disposable.dispose();
      else if (domNode) domNode.removeEventListener('paste', handlePaste, true);
    };
  }, [activeTab, tabs]);

  // Manual save action
  const saveActiveFile = async () => {
    if (activeTab < 0) return;
    const t = tabs[activeTab];
    if (!t?.path) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('jwt');
      const headers = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
      await fetch('/compute/fs/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: t.path, content: t.content || '' }),
      });
      setDirtyMap((m) => ({ ...m, [t.path]: false }));
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  // Save As removed per request
  const saveAsActiveFile = async () => {};

  // Always let the editor fill its flex container height.
  const editorHeight = '100%';

  // Allow closing with Escape key when expanded
  useEffect(() => {
    if (!isExpanded) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isExpanded]);

  // Keyboard shortcut: Cmd/Ctrl+S for manual save
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveActiveFile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveActiveFile, activeTab, tabs]);
  
  return (
  <div
      data-component="ide"
      className={
    `${isExpanded ? 'fixed inset-0 z-50 p-0 md:p-4 flex flex-col' : 'relative h-full flex flex-col'} ` +
        `rounded-xl shadow-lg border overflow-hidden transition-all duration-300 ${
          theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
        }`
      }
      style={isExpanded ? { maxWidth: '100%', maxHeight: '100%' } : {}}
    >
      {/* Code Editor Section */}
      <div
        className={`px-4 py-3 border-b ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <h3
            className={`text-lg font-semibold flex items-center ${
              theme === 'dark' ? 'text-gray-100' : 'text-gray-800'
            }`}
          >
            <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
            {languageConfig.title}
          </h3>
          <div className="flex items-center gap-2">
            {/* Save button with dirty indicator */}
            <button
              type="button"
              onClick={saveActiveFile}
              disabled={activeTab < 0 || saving || !dirtyMap[tabs[activeTab]?.path]}
              className={`inline-flex items-center justify-center text-xs p-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                theme === 'dark'
                  ? 'bg-gray-700 text-gray-100 ring-gray-500 hover:bg-gray-600 focus:ring-blue-500 focus:ring-offset-gray-800 disabled:opacity-50'
                  : 'bg-white text-gray-800 ring-1 ring-gray-300 hover:bg-gray-100 focus:ring-blue-500 focus:ring-offset-gray-50 disabled:opacity-50'
              }`}
              aria-label="Save file"
              title={dirtyMap[tabs[activeTab]?.path] ? 'Save changes (autosave runs after you pause typing)' : 'No changes to save'}
            >
              {saving ? (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path d="M17 3a2 2 0 012 2v10a2 2 0 01-2 2H7l-4-4V5a2 2 0 012-2h12zm-3 3H6v4h8V6z" />
                </svg>
              )}
              <span className="sr-only">Save</span>
              {dirtyMap[tabs[activeTab]?.path] && (
                <span className="ml-1 inline-block w-2 h-2 rounded-full bg-amber-500" aria-hidden title="Unsaved changes" />
              )}
            </button>
            {/* Save As removed */}
            <button
              type="button"
              onClick={handleRunCode}
              disabled={loading || saving || autoSaving}
              className={`inline-flex items-center justify-center text-xs p-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                theme === 'dark'
                  ? 'bg-blue-600 text-white hover:bg-blue-500 focus:ring-blue-400 focus:ring-offset-gray-800'
                  : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 focus:ring-offset-gray-50'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
              aria-label="Run code"
              title={saving || autoSaving ? 'Disabled while saving…' : 'Run code'}
            >
              {loading ? (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3l14 9-14 9V3z" />
                </svg>
              )}
              <span className="sr-only">Run</span>
            </button>
            <button
              type="button"
              onClick={toggleExpand}
              aria-pressed={isExpanded}
              className={`inline-flex items-center justify-center text-xs p-2 rounded-md transition-colors ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                theme === 'dark'
                  ? 'bg-gray-700 text-gray-100 ring-gray-500 hover:bg-gray-600 focus:ring-blue-500 focus:ring-offset-gray-800'
                  : 'bg-white text-gray-800 ring-gray-300 hover:bg-gray-100 focus:ring-blue-500 focus:ring-offset-gray-50'
              }`}
              aria-label={isExpanded ? 'Collapse editor' : 'Expand editor'}
              title={isExpanded ? 'Collapse editor (Esc)' : 'Expand editor'}
            >
              {isExpanded ? (
                // Minimize icon
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 15h16M4 9h16" />
                </svg>
              ) : (
                // Maximize icon
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
                </svg>
              )}
              <span className="sr-only">{isExpanded ? 'Collapse' : 'Expand'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                console.log('IDE: toggleTheme clicked');
                toggleTheme();
              }}
              aria-pressed={theme === 'dark'}
              className={`relative z-10 inline-flex items-center justify-center text-xs p-2 rounded-md transition-colors ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                theme === 'dark'
                  ? 'bg-gray-700 text-gray-100 ring-gray-500 hover:bg-gray-600 focus:ring-blue-500 focus:ring-offset-gray-800'
                  : 'bg-white text-gray-800 ring-gray-300 hover:bg-gray-100 focus:ring-blue-500 focus:ring-offset-gray-50'
              }`}
              aria-label="Toggle light/dark mode"
              title="Toggle light/dark mode"
            >
              {theme === 'dark' ? (
                // Sun icon
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                    d="M12 3v2m0 14v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M3 12h2m14 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                // Moon icon
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                    d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              )}
              <span className="sr-only">Toggle theme</span>
            </button>
          </div>
        </div>
      </div>
  {/* Main content row: Explorer + Editor */}
  <div className={`${isExpanded ? 'px-3 pb-0 pt-2 md:px-4' : 'px-4 pt-2'} w-full flex-1 min-h-0 ${explorerDragging ? 'select-none' : ''}`}>
        <div className={`relative flex ${isExpanded ? 'overflow-hidden' : ''}`}>
          {/* Sidebar: Explorer */}
          {showExplorer && (
            <>
              <div
                className={`mr-2 rounded-lg border ${theme==='dark'?'border-gray-700 bg-gray-900':'border-gray-200 bg-gray-50'} flex-shrink-0 overflow-hidden`}
                style={{ width: explorerWidth, minWidth: 160, maxWidth: '60vw' }}
              >
                <FileExplorer theme={theme} onOpenFile={openFileInTab} />
              </div>
              {/* Vertical resize handle */}
              <div
                onMouseDown={startExplorerResize}
                onKeyDown={onExplorerKeyDown}
                title="Drag to resize file explorer"
                aria-label="Resize file explorer"
                role="separator"
                aria-orientation="vertical"
                aria-valuemin={minExplorerWidth}
                aria-valuenow={explorerWidth}
                aria-valuemax={getMaxExplorerWidth()}
                tabIndex={0}
                className={`${theme==='dark'?'bg-gray-700 hover:bg-gray-600':'bg-gray-200 hover:bg-gray-300'} w-1.5 cursor-col-resize rounded mx-1 relative z-20 focus:outline-none focus:ring-2 ${theme==='dark'?'focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900':'focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white'}`}
                style={{ alignSelf: 'stretch' }}
              />
              {/* Overlay handle for easier grab area (also active in collapsed mode) */}
              <div
                onMouseDown={startExplorerResize}
                onKeyDown={onExplorerKeyDown}
                title="Drag to resize file explorer"
                aria-label="Resize file explorer (overlay)"
                role="separator"
                aria-orientation="vertical"
                aria-valuemin={minExplorerWidth}
                aria-valuenow={explorerWidth}
                aria-valuemax={getMaxExplorerWidth()}
                tabIndex={0}
                className={`absolute top-0 bottom-0 z-30 cursor-col-resize ${theme==='dark'?'hover:bg-gray-600/40':'hover:bg-gray-300/40'} focus:outline-none focus:ring-2 ${theme==='dark'?'focus:ring-blue-500':'focus:ring-blue-500'}`}
                style={{ left: (explorerWidth + 8), width: 10 }}
              />
            </>
          )}
          {/* Main editor area with tabs */}
          <div className="flex-1 flex flex-col min-h-[320px]">
            {/* Tabs */}
            <div className={`flex items-center gap-1 px-2 py-1 border-b ${theme==='dark'?'border-gray-700 bg-gray-800':'border-gray-200 bg-gray-100'}`} role="tablist">
              {tabs.length === 0 ? (
                <div className={`text-xs italic px-2 py-1 ${theme==='dark'?'text-gray-400':'text-gray-500'}`}>Open a file from Explorer…</div>
              ) : (
                tabs.map((t, i) => (
                  <button
                    key={t.path}
                    className={`max-w-[220px] flex items-center gap-2 px-3 py-1 rounded-md border ${i===activeTab ? (theme==='dark'?'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-300 text-gray-900') : (theme==='dark'?'bg-gray-800 border-transparent text-gray-300 hover:bg-gray-700':'bg-gray-100 border-transparent text-gray-700 hover:bg-gray-50')}`}
                    onClick={() => { setActiveTab(i); setFileContent(t.content); }}
                    role="tab"
                    aria-selected={i===activeTab}
                    title={t.path}
                  >
                    <span className="truncate flex items-center gap-1">
                      {t.path.split('/').slice(-1)[0]}
                      {dirtyMap[t.path] && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden />}
                    </span>
                    <span className={`text-[10px] ${theme==='dark'?'text-gray-400':'text-gray-500'}`}>{t.language}</span>
                    <span
                      onClick={(e) => { e.stopPropagation(); closeTab(i); }}
                      className={`ml-1 inline-flex items-center justify-center w-4 h-4 rounded ${theme==='dark'?'hover:bg-gray-600':'hover:bg-gray-200'}`}
                      aria-label={`Close ${t.path}`}
                      role="button"
                    >
                      ×
                    </span>
                  </button>
                ))
              )}
            </div>
            {/* Editor */}
            <div className={`border rounded-b-lg overflow-hidden mt-0 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'} flex-1 flex flex-col`}>
              <Editor
                language={(tabs[activeTab]?.language) || languageConfig.mode}
                theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                value={tabs[activeTab]?.content ?? fileContent}
                onChange={(value) => {
                  const v = value || '';
                  handleFileContentChange(v);
                  updateActiveTabContent(v);
                  // Emit debounced ide_input representing current buffer
                  try { emitIDEInput.current?.(v); } catch {}
                }}
                width="100%"
                height={editorHeight}
                onMount={(editor) => { editorRef.current = editor; }}
                options={{
                  fontSize: 14,
                  lineNumbers: 'on',
                  tabSize: 4,
                  automaticLayout: true,
                  minimap: { enabled: false },
                  renderLineHighlight: 'line',
                  wordWrap: 'off',
                  scrollBeyondLastLine: false,
                  quickSuggestions: true,
                  suggestOnTriggerCharacters: true,
                }}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Embedded Terminal (if requested) below the editor, inside the IDE card */}
      {showEmbeddedTerminal && (
        <div className={`${isExpanded ? 'px-3 pb-0 pt-2 md:px-4' : 'px-4 pt-2'} w-full`}>
          <div className="mt-1 relative z-40">
            <Terminal terminalText={embeddedTerminalText} embedded={true} />
          </div>
        </div>
      )}

      {/* Output Section below the terminal/editor row, resizable & collapsible */}
      {outputText && (
        <div className={`${isExpanded ? 'px-3 pb-3 pt-2 md:px-4' : 'px-4 pt-2'} w-full`}
             style={{ userSelect: dragStateRef.current.dragging ? 'none' : undefined }}>
          <div
            className={`w-full rounded-lg font-mono text-sm ${
              theme === 'dark' ? 'bg-gray-900 text-green-400 border border-gray-700' : 'bg-gray-50 text-gray-800 border border-gray-200'
            } overflow-hidden`}
            style={{ height: outputCollapsed ? 36 : outputHeight }}
          >
            {/* Resize handle */}
            {!outputCollapsed && (
              <div
                onMouseDown={onResizeMouseDown}
                title="Drag to resize"
                className={`${theme==='dark'?'bg-gray-800':'bg-gray-200'} h-2 w-full cursor-row-resize flex items-center justify-center`}
                aria-label="Resize output panel"
              >
                <div className={`${theme==='dark'?'bg-gray-600':'bg-gray-400'} h-1 w-24 rounded`}></div>
              </div>
            )}
            {/* Header */}
            <div className={`flex items-center justify-between px-3 ${outputCollapsed ? 'h-9' : 'h-9'} ${theme==='dark'?'bg-gray-850/40':'bg-gray-100/60'} border-b ${theme==='dark'?'border-gray-700':'border-gray-200'}`}>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                <span className={`${theme === 'dark' ? 'text-green-300' : 'text-gray-700'} font-semibold`}>Output</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOutputCollapsed(c => !c)}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ring-1 ring-inset ${theme==='dark'?'bg-gray-800 text-gray-200 ring-gray-600 hover:bg-gray-700':'bg-white text-gray-800 ring-gray-300 hover:bg-gray-100'}`}
                  aria-expanded={!outputCollapsed}
                  aria-controls="ide-output-panel"
                  title={outputCollapsed ? 'Expand output' : 'Collapse output'}
                >
                  {outputCollapsed ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>
            {/* Body */}
            {!outputCollapsed && (
              <div id="ide-output-panel" className="p-4 w-full h-[calc(100%-2.25rem-0.5rem)] overflow-auto">
                <pre className="whitespace-pre-wrap ide-output" role="log" aria-live="polite">
                  {outputText}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

  {/* Removed redundant Esc/Close overlay button; collapse available in header and via Esc key */}

      {/* Undo bar */}
  {showUndo && (
        <div
          className={`group absolute bottom-4 left-1/2 z-[70] -translate-x-1/2 transform rounded-full border px-3 py-1.5 shadow inline-flex items-center ${
            theme === 'dark'
              ? 'border-gray-700 bg-gray-800 text-gray-100'
              : 'border-gray-300 bg-white text-gray-800'
          }`}
          role="status"
          aria-live="polite"
        >
          {/* Dismiss button (shows on hover) */}
          <button
            type="button"
            onClick={() => setShowUndo(false)}
            className={`absolute -top-2 -right-2 h-6 w-6 inline-flex items-center justify-center rounded-full border shadow-sm transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100 ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
            }`}
            aria-label="Dismiss"
            title="Dismiss"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M6.225 4.811a1 1 0 011.414 0L12 9.172l4.361-4.361a1 1 0 111.414 1.414L13.414 10.586l4.361 4.361a1 1 0 01-1.414 1.414L12 12l-4.361 4.361a1 1 0 01-1.414-1.414l4.361-4.361-4.361-4.361a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <span className="mr-3 text-xs">Inserted code from Lab Assistant.</span>
          <button
            onClick={undoReplace}
            className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
};

export default IDE;
