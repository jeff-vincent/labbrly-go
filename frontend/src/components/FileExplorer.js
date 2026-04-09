import React, { useEffect, useState, useCallback, useMemo } from 'react';

// Lightweight tree view of files inside the user's compute environment
// Props:
// - rootPath?: string (default '.')
// - onOpenFile: (path: string) => void
// - theme: 'light' | 'dark'
// - embedded?: boolean (force iframe-safe UI; defaults to auto-detect)
// - forceAutoLoad?: boolean (load directories even in test env)
const FileExplorer = ({ rootPath = '.', onOpenFile, theme = 'light', embedded, forceAutoLoad = false }) => {
  const [nodes, setNodes] = useState({}); // path -> { loaded: bool, entries: [{name, path, type}] }
  const [expanded, setExpanded] = useState(new Set());
  const [error, setError] = useState('');
  const [loadingRoot, setLoadingRoot] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('');
  // Iframe-safe inline UX states
  const [renameEditingPath, setRenameEditingPath] = useState(null); // path being renamed inline
  const [renameInput, setRenameInput] = useState('');
  const [deleteConfirmPath, setDeleteConfirmPath] = useState(null);

  const inIframe =
    typeof embedded === 'boolean'
      ? embedded
      : (typeof window !== 'undefined' && window.top !== window.self);

  const jwt = typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;
  const headers = useMemo(() => (jwt ? { Authorization: `Bearer ${jwt}` } : {}), [jwt]);

  const loadDir = useCallback(async (path) => {
    try {
      setError('');
      if (nodes[path]?.loaded) return; // already loaded
      if (path === rootPath) setLoadingRoot(true);
      const u = new URL('/compute/fs/list', window.location.origin);
      u.searchParams.set('path', path);
      const res = await fetch(u.toString(), { headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to list');
      }
      // Filter out dotfiles/directories and the special check script from display only
      const filtered = (data.entries || []).filter((e) => {
        const name = e?.name || '';
        return !(name.startsWith('.') || name === 'check_lab.sh');
      });
      setNodes((prev) => ({ ...prev, [path]: { loaded: true, entries: filtered } }));
    } catch (e) {
      setError(`${path}: ${e?.message || e}`);
    } finally {
      if (path === rootPath) setLoadingRoot(false);
    }
  }, [headers, nodes, rootPath]);

  // Refresh the explorer: reload root and any expanded directories
  const refreshExplorer = useCallback(async () => {
    try {
      setError('');
      const paths = new Set([rootPath, ...expanded]);
      // Mark all as stale so loadDir will fetch
      setNodes((prev) => {
        const next = { ...prev };
        for (const p of paths) {
          next[p] = { loaded: false, entries: [] };
        }
        return next;
      });
      await Promise.all(Array.from(paths).map((p) => loadDir(p)));
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [expanded, rootPath, loadDir]);

  useEffect(() => {
    // Skip auto-loading in test environment unless explicitly forced
    const shouldAutoLoad = forceAutoLoad || process.env.NODE_ENV !== 'test';
    if (!shouldAutoLoad) return;
    loadDir(rootPath);
  }, [rootPath, loadDir, forceAutoLoad]);

  const toggle = async (path) => {
    const next = new Set(Array.from(expanded));
    if (next.has(path)) next.delete(path); else next.add(path);
    setExpanded(next);
    if (next.has(path)) await loadDir(path);
  };

  // Create and delete helpers
  const createFile = async (path) => {
    try {
      setError('');
      const res = await fetch('/compute/fs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ path, content: '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to create');
      // Reload parent dir
      const parent = path.split('/').slice(0, -1).join('/') || '.';
      setNodes((prev) => ({ ...prev, [parent]: { loaded: false, entries: [] } }));
      await loadDir(parent);
      // Auto-open the new file in editor if callback provided
      if (typeof onOpenFile === 'function') {
        onOpenFile(path);
      }
    } catch (e) {
      setError(`${path}: ${e?.message || e}`);
    }
  };

  const createFolder = async (path) => {
    try {
      setError('');
      const res = await fetch('/compute/fs/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ path }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to create folder');
      const parent = path.split('/').slice(0, -1).join('/') || '.';
      setNodes((prev) => ({ ...prev, [parent]: { loaded: false, entries: [] } }));
      await loadDir(parent);
    } catch (e) {
      setError(`${path}: ${e?.message || e}`);
    }
  };

  const deletePath = async (path) => {
    // Default behavior uses browser modal; may be blocked in iframe
    if (!inIframe && !window.confirm(`Delete ${path}?`)) return;
    try {
      setError('');
      const res = await fetch('/compute/fs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ path }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to delete');
      const parent = path.split('/').slice(0, -1).join('/') || '.';
      // If the deleted path was expanded, collapse it
      setExpanded((prev) => {
        const next = new Set(Array.from(prev));
        next.delete(path);
        return next;
      });
      setNodes((prev) => ({ ...prev, [parent]: { loaded: false, entries: [] } }));
      await loadDir(parent);
    } catch (e) {
      setError(`${path}: ${e?.message || e}`);
    } finally {
      setDeleteConfirmPath((p) => (p === path ? null : p));
    }
  };

  const renamePath = async (srcPath) => {
    const parts = srcPath.split('/');
    const name = parts.pop();
    const parent = parts.join('/') || '.';
    if (inIframe) {
      // Use inline input when embedded; UI handler will call renamePathTo
      setRenameEditingPath(srcPath);
      setRenameInput(name);
      return;
    }
    const newName = window.prompt('Rename to (name or full path):', name);
    if (!newName) return;
    await renamePathTo(srcPath, newName);
  };

  const renamePathTo = async (srcPath, newName) => {
    const parts = srcPath.split('/');
    const parent = parts.slice(0, -1).join('/') || '.';
    const dest = newName.includes('/') ? newName : (parent === '.' ? newName : `${parent}/${newName}`);
    try {
      setError('');
      const res = await fetch('/compute/fs/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ src: srcPath, dest }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to rename');
      setNodes((prev) => ({ ...prev, [parent]: { loaded: false, entries: [] } }));
      await loadDir(parent);
      if (expanded.has(srcPath)) {
        const next = new Set(Array.from(expanded));
        next.delete(srcPath);
        next.add(dest);
        setExpanded(next);
      }
    } catch (e) {
      setError(`${srcPath}: ${e?.message || e}`);
    } finally {
      setRenameEditingPath((p) => (p === srcPath ? null : p));
      setRenameInput('');
    }
  };

  const Item = ({ entry, depth }) => {
    const padding = 8 + depth * 12;
    const isDir = entry.type === 'dir';
    const isOpen = expanded.has(entry.path);
    const entries = nodes[entry.path]?.entries || [];
    return (
      <div>
        <div
          className={`flex items-center cursor-pointer select-none px-2 py-1 text-sm rounded-md ${
            theme === 'dark' ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-800 hover:bg-gray-100'
          }`}
          style={{ paddingLeft: padding }}
          onClick={() => (isDir ? toggle(entry.path) : onOpenFile?.(entry.path))}
          role="treeitem"
          aria-expanded={isDir ? isOpen : undefined}
          aria-selected={false}
        >
          {isDir ? (
            <svg className="w-4 h-4 mr-2" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              {isOpen ? (
                <path d="M2 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              ) : (
                <path d="M2 6a2 2 0 012-2h3l2 2h9v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              )}
            </svg>
          ) : (
            <svg className="w-4 h-4 mr-2" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h8l6-6V4a2 2 0 00-2-2H4z" />
            </svg>
          )}
          {renameEditingPath === entry.path ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                className={`text-xs px-1 py-0.5 rounded border flex-1 min-w-0 ${theme==='dark'?'bg-gray-800 text-gray-200 border-gray-700':'bg-white text-gray-800 border-gray-300'}`}
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); renamePathTo(entry.path, renameInput.trim()); }
                  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRenameEditingPath(null); setRenameInput(''); }
                }}
                autoFocus
              />
              <button
                className={`text-xs px-1.5 py-0.5 rounded ${theme==='dark'?'bg-blue-700 hover:bg-blue-600 text-white':'bg-blue-600 hover:bg-blue-700 text-white'}`}
                onClick={(e) => { e.stopPropagation(); if (renameInput.trim()) renamePathTo(entry.path, renameInput.trim()); }}
              >Save</button>
              <button
                className={`text-xs px-1.5 py-0.5 rounded ${theme==='dark'?'bg-gray-700 hover:bg-gray-600 text-gray-100':'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
                onClick={(e) => { e.stopPropagation(); setRenameEditingPath(null); setRenameInput(''); }}
              >Cancel</button>
            </div>
          ) : (
            <span className="truncate" title={entry.name}>{entry.name}</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              className={`p-1 rounded ${theme==='dark'?'hover:bg-gray-700 text-gray-300':'hover:bg-gray-200 text-gray-700'}`}
              onClick={(e) => { e.stopPropagation(); renamePath(entry.path); }}
              title="Rename"
              aria-label="Rename"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414L15.707 4.707a1 1 0 00-1.414 0L4 14v6z" />
              </svg>
              <span className="sr-only">Rename</span>
            </button>
            <button
              className={`p-1 rounded ${theme==='dark'?'hover:bg-gray-700 text-gray-300':'hover:bg-gray-200 text-gray-700'}`}
              onClick={(e) => { e.stopPropagation(); inIframe ? setDeleteConfirmPath(entry.path) : deletePath(entry.path); }}
              title={isDir ? 'Delete folder' : 'Delete file'}
              aria-label={isDir ? 'Delete folder' : 'Delete file'}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0V5a2 2 0 012-2h2a2 2 0 012 2v2" />
              </svg>
              <span className="sr-only">Delete</span>
            </button>
            {deleteConfirmPath === entry.path && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  className={`text-xs px-1.5 py-0.5 rounded ${theme==='dark'?'bg-red-700 hover:bg-red-600 text-white':'bg-red-600 hover:bg-red-700 text-white'}`}
                  onClick={(e) => { e.stopPropagation(); deletePath(entry.path); }}
                >Confirm</button>
                <button
                  className={`text-xs px-1.5 py-0.5 rounded ${theme==='dark'?'bg-gray-700 hover:bg-gray-600 text-gray-100':'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmPath(null); }}
                >Cancel</button>
              </div>
            )}
          </div>
        </div>
        {isDir && isOpen && (
          <div>
            {nodes[entry.path]?.loaded ? (
              entries.length ? (
                entries.map((child) => (
                  <Item key={child.path} entry={child} depth={depth + 1} />
                ))
              ) : (
                <div className={`text-xs italic px-2 py-1 ml-6 ${theme==='dark'?'text-gray-400':'text-gray-500'}`}>empty</div>
              )
            ) : (
              <div className={`text-xs px-2 py-1 ml-6 ${theme==='dark'?'text-gray-400':'text-gray-500'}`}>Loading…</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const rootEntries = nodes[rootPath]?.entries || [];

  return (
    <div className={`h-full flex flex-col ${theme==='dark'?'bg-gray-900':'bg-gray-50'}`} role="tree" aria-label="File explorer">
      <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide flex items-center justify-between ${theme==='dark'?'text-gray-300':'text-gray-600'}`}>
        <span>Explorer</span>
        <div className="flex items-center gap-1">
          <button
            className={`p-1.5 rounded ${theme==='dark'?'bg-gray-800 text-gray-200 hover:bg-gray-700':'bg-white text-gray-700 hover:bg-gray-100'} border ${theme==='dark'?'border-gray-700':'border-gray-300'}`}
            onClick={() => { setCreating((v) => !v); setNewPath(''); setCreatingFolder(false); }}
            title="Create new file"
            aria-label="Create new file"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="sr-only">New File</span>
          </button>
          <button
            className={`p-1.5 rounded ${theme==='dark'?'bg-gray-800 text-gray-200 hover:bg-gray-700':'bg-white text-gray-700 hover:bg-gray-100'} border ${theme==='dark'?'border-gray-700':'border-gray-300'}`}
            onClick={() => { setCreatingFolder((v) => !v); setNewFolderPath(''); setCreating(false); }}
            title="Create new folder"
            aria-label="Create new folder"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7h5l2 2h11v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              <path strokeWidth="2" strokeLinecap="round" d="M12 12v6m3-3H9" />
            </svg>
            <span className="sr-only">New Folder</span>
          </button>
          <button
            className={`p-1.5 rounded ${theme==='dark'?'bg-gray-800 text-gray-200 hover:bg-gray-700':'bg-white text-gray-700 hover:bg-gray-100'} border ${theme==='dark'?'border-gray-700':'border-gray-300'}`}
            onClick={refreshExplorer}
            title="Refresh"
            aria-label="Refresh"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <circle cx="12" cy="12" r="9" strokeWidth="2" />
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
            </svg>
            <span className="sr-only">Refresh</span>
          </button>
        </div>
      </div>
      {creating && (
        <div className={`px-2 py-2 border-b ${theme==='dark'?'border-gray-800':'border-gray-200'} flex items-center gap-2`}>
          <input
            type="text"
            placeholder="path/to/new/file.ext"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            className={`flex-1 text-xs px-2 py-1 rounded border ${theme==='dark'?'bg-gray-800 text-gray-200 border-gray-700':'bg-white text-gray-800 border-gray-300'}`}
          />
          <button
            className={`text-xs px-2 py-1 rounded ${theme==='dark'?'bg-blue-700 hover:bg-blue-600 text-white':'bg-blue-600 hover:bg-blue-700 text-white'}`}
            onClick={async () => { if (!newPath.trim()) return; await createFile(newPath.trim()); setCreating(false); setNewPath(''); }}
          >
            Create
          </button>
          <button
            className={`text-xs px-2 py-1 rounded ${theme==='dark'?'bg-gray-700 hover:bg-gray-600 text-gray-100':'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
            onClick={() => { setCreating(false); setNewPath(''); }}
          >
            Cancel
          </button>
        </div>
      )}
      {creatingFolder && (
        <div className={`px-2 py-2 border-b ${theme==='dark'?'border-gray-800':'border-gray-200'} flex items-center gap-2`}>
          <input
            type="text"
            placeholder="path/to/new/folder"
            value={newFolderPath}
            onChange={(e) => setNewFolderPath(e.target.value)}
            className={`flex-1 text-xs px-2 py-1 rounded border ${theme==='dark'?'bg-gray-800 text-gray-200 border-gray-700':'bg-white text-gray-800 border-gray-300'}`}
          />
          <button
            className={`text-xs px-2 py-1 rounded ${theme==='dark'?'bg-blue-700 hover:bg-blue-600 text-white':'bg-blue-600 hover:bg-blue-700 text-white'}`}
            onClick={async () => { const p = newFolderPath.trim(); if (!p) return; await createFolder(p); setCreatingFolder(false); setNewFolderPath(''); }}
          >
            Create
          </button>
          <button
            className={`text-xs px-2 py-1 rounded ${theme==='dark'?'bg-gray-700 hover:bg-gray-600 text-gray-100':'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
            onClick={() => { setCreatingFolder(false); setNewFolderPath(''); }}
          >
            Cancel
          </button>
        </div>
      )}
      <div className={`px-2 ${theme==='dark'?'text-gray-200':'text-gray-800'} flex-1 overflow-auto`}>
        {loadingRoot && !nodes[rootPath]?.loaded ? (
          <div className="text-xs px-2 py-1">Loading…</div>
        ) : rootEntries.length ? (
          rootEntries.map((e) => <Item key={e.path} entry={e} depth={0} />)
        ) : (
          <div className="text-xs px-2 py-1 italic">No files</div>
        )}
        {error && (
          <div className="mt-2 text-xs text-red-500 break-words" role="alert">{error}</div>
        )}
      </div>
    </div>
  );
};

export default FileExplorer;
