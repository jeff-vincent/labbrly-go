import React from 'react';
import MdEditor from 'react-markdown-editor-lite';
import 'react-markdown-editor-lite/lib/index.css';
import MarkdownIt from 'markdown-it';
import Editor from '@monaco-editor/react';

export const deriveEditorLanguage = (cmd) => {
  if (!cmd) return 'python';
  const c = String(cmd || '').toLowerCase();
  if (c.includes('node')) return 'javascript';
  if (c.includes('go')) return 'go';
  return 'python';
};

// Resource size presets for containers
export const RESOURCE_SPECS = {
  small: {
    cpu: { request: '100m', limit: '400m' },
    memory: { request: '320Mi', limit: '640Mi' },
    label: 'Small',
    description: '0.1–0.4 vCPU, 320–640 MiB RAM',
  },
  medium: {
    cpu: { request: '200m', limit: '800m' },
    memory: { request: '640Mi', limit: '1280Mi' },
    label: 'Medium',
    description: '0.2–0.8 vCPU, 640–1280 MiB RAM',
  },
  large: {
    cpu: { request: '400m', limit: '1600m' },
    memory: { request: '1280Mi', limit: '2560Mi' },
    label: 'Large',
    description: '0.4–1.6 vCPU, 1.25–2.5 GiB RAM',
  },
};

export const ResourceSizeSection = ({ value, onChange, idPrefix, disabled = false }) => {
  const options = [
    { key: 'small', ...RESOURCE_SPECS.small },
    { key: 'medium', ...RESOURCE_SPECS.medium },
    { key: 'large', ...RESOURCE_SPECS.large },
  ];
  return (
    <div className="space-y-3 p-4 border rounded-lg dark:border-cp-border dark:bg-cp-panel-alt">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-md font-medium text-gray-900 dark:text-neutral-100">Container Size</h4>
          <p className="text-sm text-gray-600 dark:text-neutral-400">Choose CPU/Memory resources for the container</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {options.map((opt) => (
          <label key={opt.key} className={`relative cursor-pointer rounded-lg border p-3 transition-colors dark:border-cp-border ${
              value === opt.key ? 'border-green-500 ring-1 ring-green-300' : 'border-gray-200'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
            <input
              type="radio"
              name={`${idPrefix}-resource-size`}
              value={opt.key}
              checked={value === opt.key}
              onChange={(e) => onChange && onChange(e.target.value)}
              disabled={disabled}
              className="sr-only"
            />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold dark:text-neutral-100">{opt.label}</span>
              <span className="text-xs text-gray-600 dark:text-neutral-400">{opt.description}</span>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-700 dark:text-neutral-300">
                <div>
                  <div className="font-medium">CPU</div>
                  <div>Req: {opt.cpu.request}</div>
                  <div>Lim: {opt.cpu.limit}</div>
                </div>
                <div>
                  <div className="font-medium">Memory</div>
                  <div>Req: {opt.memory.request}</div>
                  <div>Lim: {opt.memory.limit}</div>
                </div>
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};

// Session TTL selector (minutes). Premium-only; disable for free plans.
export const TTLSelector = ({ valueMinutes, onChange, idPrefix, disabled = false }) => {
  const presetOptions = [
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' },
    { value: 240, label: '4 hours' },
    { value: 1440, label: '24 hours' },
  ];
  const isPreset = presetOptions.some((o) => o.value === Number(valueMinutes));
  const selectValue = isPreset ? String(valueMinutes) : 'custom';

  return (
    <div className="space-y-3 p-4 border rounded-lg dark:border-cp-border dark:bg-cp-panel-alt">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-md font-medium text-gray-900 dark:text-neutral-100">Session TTL</h4>
          <p className="text-sm text-gray-600 dark:text-neutral-400">How long a running lab stays active before auto-cleanup</p>
        </div>
        {disabled && (
          <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">Premium Feature</span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
        <select
          id={`${idPrefix}-ttl-select`}
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'custom') {
              // no-op; user will type in the custom input
              return;
            }
            onChange && onChange(Number(v));
          }}
          disabled={disabled}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 ${
            disabled ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed dark:bg-cp-panel-alt dark:border-cp-border' : 'bg-white border-gray-300 dark:bg-cp-panel dark:border-cp-border dark:text-neutral-200'
          }`}
        >
          {presetOptions.map((opt) => (
            <option key={opt.value} value={String(opt.value)}>{opt.label}</option>
          ))}
          <option value="custom">Custom…</option>
        </select>

        <div className="flex items-center gap-2">
          <input
            id={`${idPrefix}-ttl-custom`}
            type="number"
            min={15}
            max={2880}
            step={15}
            value={isPreset ? '' : String(valueMinutes || '')}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) onChange && onChange(n);
            }}
            disabled={disabled || isPreset}
            placeholder="Custom (mins)"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 ${
              disabled || isPreset ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed dark:bg-cp-panel-alt dark:border-cp-border' : 'bg-white border-gray-300 dark:bg-cp-panel dark:border-cp-border dark:text-neutral-200'
            }`}
          />
          <span className="text-xs text-gray-500 dark:text-neutral-500">mins</span>
        </div>
      </div>
      {!disabled && (
        <p className="text-xs text-gray-500 dark:text-neutral-500">Presets: 30m, 1h, 4h, 24h. Enter a custom value (15–2880 mins) if needed.</p>
      )}
    </div>
  );
};

export const ElementSelector = ({ availableElements, selectedElements, onToggle, idPrefix, scoredLab, onScoredChange, scoredDisabled = false }) => (
  <div className="bg-gray-50 p-4 rounded-lg dark:bg-cp-panel-alt dark:border dark:border-cp-border">
    <h3 className="text-lg font-medium text-gray-900 mb-2 dark:text-neutral-100">Select Lab Components</h3>
    <div className="mb-3 flex items-center space-x-2">
      <input
        type="checkbox"
        id={`${idPrefix}-scoredLab`}
        checked={!!scoredLab}
        onChange={(e) => onScoredChange && onScoredChange(e.target.checked)}
        disabled={scoredDisabled}
  className={`h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded ${scoredDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
      />
      <label htmlFor={`${idPrefix}-scoredLab`} className={`text-sm font-medium dark:text-neutral-300 ${scoredDisabled ? 'cursor-not-allowed' : ''}`}>
        Scored Lab
        {scoredDisabled && (
          <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">Premium Feature</span>
        )}
      </label>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {availableElements.map((element) => {
        const checked = selectedElements.includes(element.id);
        const checkboxId = `${idPrefix}-element-${element.id}`;
        return (
          <div key={element.id} className="flex items-start space-x-3">
            <input
              type="checkbox"
              id={checkboxId}
              checked={checked}
              onChange={() => onToggle(element.id)}
              className="mt-1 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
            />
            <div className="flex-1">
              <label htmlFor={checkboxId} className="block text-sm font-medium text-gray-700 cursor-pointer dark:text-neutral-300">{element.label}</label>
              <p className="text-xs text-gray-500 dark:text-neutral-500">{element.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export const LabTextSection = ({ active, value, onChange, idPrefix }) => (
  <div className={`space-y-4 p-4 border rounded-lg transition-all duration-200 dark:border-cp-border dark:bg-cp-panel-alt ${
    active ? 'border-green-200 bg-white' : 'border-gray-200 bg-gray-50'
  }`}>
    <div className="flex items-center space-x-2">
      <h4 className={`text-md font-medium ${active ? 'text-gray-900 dark:text-neutral-100' : 'text-gray-400 dark:text-neutral-500'}`}>Lab Text Content</h4>
  {active && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Active</span>}
    </div>
    <div className="space-y-2">
      <label htmlFor={`${idPrefix}-labText`} className={`block text-sm font-medium ${active ? 'text-gray-700 dark:text-neutral-300' : 'text-gray-400 dark:text-neutral-500'}`}>Lab Content</label>
      <div className={`border rounded-lg overflow-hidden ${active ? 'border-gray-300' : 'border-gray-200'}`}>
        <div className={active ? 'bg-white dark:bg-cp-panel dark:text-neutral-200' : 'bg-gray-100 dark:bg-cp-panel-alt pointer-events-none opacity-70'}>
          <MdEditor
            id={`${idPrefix}-labText`}
            value={value}
            style={{ height: '260px' }}
            renderHTML={(text) => new MarkdownIt({ linkify: true, breaks: true }).render(text)}
            onChange={({ text }) => onChange(text)}
            view={{ menu: true, md: true, html: true }}
            config={{ placeholder: 'Write lab instructions in Markdown...' }}
          />
        </div>
      </div>
    </div>
  </div>
);

export const IDESection = ({ active, scriptName, setScriptName, executionCommand, setExecutionCommand, exampleCode, setExampleCode, idPrefix, editorTheme = 'vs-dark' }) => (
  <div className={`space-y-4 p-4 border rounded-lg transition-all duration-200 dark:border-cp-border dark:bg-cp-panel-alt ${
    active ? 'border-green-200 bg-white' : 'border-gray-200 bg-gray-50'
  }`}>
    <div className="flex items-center space-x-2">
      <h4 className={`text-md font-medium ${active ? 'text-gray-900 dark:text-neutral-100' : 'text-gray-400 dark:text-neutral-500'}`}>IDE Content</h4>
  {active && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Active</span>}
    </div>
    <div className="space-y-2">
      <label htmlFor={`${idPrefix}-scriptName`} className={`block text-sm font-medium ${active ? 'text-gray-700 dark:text-neutral-300' : 'text-gray-400 dark:text-neutral-500'}`}>Script Name</label>
      <input
        id={`${idPrefix}-scriptName`}
        type="text"
        value={scriptName}
        onChange={(e) => setScriptName(e.target.value)}
        disabled={!active}
  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 font-mono text-sm ${
          active ? 'bg-white border-gray-300 dark:bg-cp-panel dark:border-cp-border dark:text-neutral-200' : 'bg-gray-100 border-gray-200 text-gray-400 dark:bg-cp-panel-alt dark:border-cp-border'
        }`}
        placeholder="e.g., script.py, main.go, app.js"
      />
    </div>
    <div className="space-y-2">
      <label htmlFor={`${idPrefix}-executionCommand`} className={`block text-sm font-medium ${active ? 'text-gray-700 dark:text-neutral-300' : 'text-gray-400 dark:text-neutral-500'}`}>Execution Command</label>
      <input
        id={`${idPrefix}-executionCommand`}
        type="text"
        value={executionCommand}
        onChange={(e) => setExecutionCommand(e.target.value)}
        disabled={!active}
  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 font-mono text-sm ${
          active ? 'bg-white border-gray-300 dark:bg-cp-panel dark:border-cp-border dark:text-neutral-200' : 'bg-gray-100 border-gray-200 text-gray-400 dark:bg-cp-panel-alt dark:border-cp-border'
        }`}
        placeholder="e.g., python, go run, node"
      />
    </div>
    <div className="space-y-2">
      <label htmlFor={`${idPrefix}-exampleCode`} className={`block text-sm font-medium ${active ? 'text-gray-700 dark:text-neutral-300' : 'text-gray-400 dark:text-neutral-500'}`}>Example Code</label>
      <div className={`border rounded-lg overflow-hidden ${active ? 'border-gray-300' : 'border-gray-200 bg-gray-100'}`}>
        <Editor
          height="300px"
          value={exampleCode}
          onChange={(value) => setExampleCode(value || '')}
          options={{ readOnly: !active, minimap: { enabled: false }, fontSize: 12, wordWrap: 'on', scrollBeyondLastLine: false, quickSuggestions: true, placeholder: 'Enter example code...' }}
          language={deriveEditorLanguage(executionCommand)}
          theme={editorTheme}
        />
      </div>
    </div>
  </div>
);

export const TerminalSection = ({ active, terminalCommands, setTerminalCommands, idPrefix }) => (
  <div className={`space-y-4 p-4 border rounded-lg transition-all duration-200 dark:border-cp-border dark:bg-cp-panel-alt ${
    active ? 'border-green-200 bg-white' : 'border-gray-200 bg-gray-50'
  }`}>
    <div className="flex items-center space-x-2">
      <h4 className={`text-md font-medium ${active ? 'text-gray-900 dark:text-neutral-100' : 'text-gray-400 dark:text-neutral-500'}`}>Terminal Content</h4>
  {active && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Active</span>}
    </div>
    <div className="space-y-2">
      <label htmlFor={`${idPrefix}-terminalCommands`} className={`block text-sm font-medium ${active ? 'text-gray-700 dark:text-neutral-300' : 'text-gray-400 dark:text-neutral-500'}`}>Terminal Commands & Expected Output</label>
      <textarea
        id={`${idPrefix}-terminalCommands`}
        value={terminalCommands}
        onChange={(e) => setTerminalCommands(e.target.value)}
        disabled={!active}
        rows="4"
  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 font-mono text-sm ${
          active ? 'bg-white border-gray-300 dark:bg-cp-panel dark:border-cp-border dark:text-neutral-200' : 'bg-gray-100 border-gray-200 text-gray-400 dark:bg-cp-panel-alt dark:border-cp-border'
        }`}
        placeholder="Enter terminal commands and expected output..."
      />
    </div>
  </div>
);

export const VideoSection = ({ active, onFileChange, idPrefix }) => (
  <div className={`space-y-4 p-4 border rounded-lg transition-all duration-200 dark:border-cp-border dark:bg-cp-panel-alt ${
    active ? 'border-green-200 bg-white' : 'border-gray-200 bg-gray-50'
  }`}>
    <div className="flex items-center space-x-2">
      <h4 className={`text-md font-medium ${active ? 'text-gray-900 dark:text-neutral-100' : 'text-gray-400 dark:text-neutral-500'}`}>Video Content</h4>
  {active && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Active</span>}
    </div>
    <div className="space-y-2">
      <label htmlFor={`${idPrefix}-video`} className={`block text-sm font-medium ${active ? 'text-gray-700 dark:text-neutral-300' : 'text-gray-400 dark:text-neutral-500'}`}>Video File</label>
      <input
        id={`${idPrefix}-video`}
        type="file"
        onChange={(e) => onFileChange(e.target.files[0])}
        disabled={!active}
        accept="video/*"
        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium ${
          active ? 'border-gray-300 file:bg-green-50 file:text-green-700 hover:file:bg-green-100 dark:border-cp-border dark:bg-cp-panel-alt' : 'border-gray-200 bg-gray-100 file:bg-gray-100 file:text-gray-400 dark:border-cp-border dark:bg-cp-panel-alt'
        }`}
      />
    </div>
  </div>
);

// Fixed AI elements list for selection
export const AI_ELEMENTS = [
  { id: 'Copilot', label: 'Lab Assistant', description: 'Inline AI assistant that helps learners as they work.' },
  { id: 'LabSessionAnalyzer', label: 'Lab Session Analyzer', description: 'Analyzes lab sessions to surface insights and support scoring.' },
];

// Default feature keywords metadata (org-admin editable when Lab Session Analyzer enabled)
export const DEFAULT_FEATURE_KEYWORDS = {
  server_run: [],
  route_define: [],
  html_edit: [],
  file_create: [],
  assistant_insert: [],
  api_call: [],
  test: [],
  config: [],
};

export const FEATURE_KEYWORD_HINTS = {
  server_run: 'uvicorn, gunicorn, python -m, go run, node , npm run, ./main, fastapi',
  route_define: '@app.get, @app.post, def read_, async def',
  html_edit: '<html, <!DOCTYPE, <head>, <body>, </html>',
  file_create: 'index.html, .py, .go, .js, .ts',
  assistant_insert: 'Inserted code from Lab Assistant',
  api_call: 'requests.get, fetch(, axios., curl , /api/',
  test: 'pytest, assert , unittest, test_',
  config: 'config, settings, env, dotenv',
};

// AI Elements selector (mirrors ElementSelector behavior)
export const AIElementSection = ({
  selectedElements = [],
  onToggle,
  idPrefix,
  disabled = false,
  // Optional: allow parent to control doc URLs
  docUrls,
  onDocUrlsChange,
  // Targeted actions (attempt & success indicators) replacing feature keywords
  targetedActions,
  onTargetedActionsChange,
}) => {
  const [rawInput, setRawInput] = React.useState('');
  const controlled = Array.isArray(docUrls);

  // Parse URLs from either controlled prop or local input
  const parsedUrls = React.useMemo(() => {
    const src = controlled ? (docUrls || []) : rawInput.split(/\n|,|\s+/g);
    const cleaned = src
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .map((s) => (s.startsWith('http://') || s.startsWith('https://') ? s : ''))
      .filter(Boolean);
    return Array.from(new Set(cleaned)).slice(0, 3); // cap to 3
  }, [controlled, rawInput, docUrls]);

  const validUrlCount = React.useMemo(() => {
    const src = controlled ? (docUrls || []) : rawInput.split(/\n|,|\s+/g);
    const cleaned = src
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .map((s) => (s.startsWith('http://') || s.startsWith('https://') ? s : ''))
      .filter(Boolean);
    return Array.from(new Set(cleaned)).length;
  }, [controlled, rawInput, docUrls]);

  // Emit a lightweight update event and expose JSON inline for scrapers
  React.useEffect(() => {
    try {
      const detail = { urls: parsedUrls };
      const evt = new CustomEvent('rag_sources_update', { detail, bubbles: true, composed: true });
      document.dispatchEvent(evt);
    } catch {}
  }, [parsedUrls]);

  const showRagInput = selectedElements.includes('Copilot') || selectedElements.includes('LabSessionAnalyzer');
  const analyzerSelected = selectedElements.includes('LabSessionAnalyzer');

  // Targeted actions state (controlled or internal)
  const [internalTargetedActions, setInternalTargetedActions] = React.useState([]);
  const effectiveTargetedActions = targetedActions || internalTargetedActions;

  const emitActionsChange = (next) => {
    if (onTargetedActionsChange) onTargetedActionsChange(next);
    else setInternalTargetedActions(next);
  };

  const parseIndicators = (raw) => Array.from(new Set(
    (raw || '')
      .split(/\n|,/) // newline or comma
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 32)
  ));

  const addAction = () => {
    const next = [
      ...effectiveTargetedActions,
      { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: '', attemptIndicators: [], successIndicators: [], notes: '' },
    ];
    emitActionsChange(next);
  };

  const updateAction = (id, field, value) => {
    const next = effectiveTargetedActions.map(a => {
      if (a.id !== id) return a;
      if (field === 'attemptIndicators' || field === 'successIndicators') return { ...a, [field]: parseIndicators(value) };
      return { ...a, [field]: value };
    });
    emitActionsChange(next);
  };

  const removeAction = (id) => {
    const next = effectiveTargetedActions.filter(a => a.id !== id);
    emitActionsChange(next);
  };

  const actionsValidation = React.useMemo(() => {
    if (!analyzerSelected) return { valid: true, reasons: [] };
    const reasons = [];
    if (!effectiveTargetedActions.length) reasons.push('At least one targeted action required.');
    effectiveTargetedActions.forEach((a, idx) => {
      if (!a.name.trim()) reasons.push(`Action #${idx + 1} missing name.`);
      if (!a.attemptIndicators.length) reasons.push(`Action "${a.name || `#${idx + 1}`}" missing attempt indicators.`);
      if (!a.successIndicators.length) reasons.push(`Action "${a.name || `#${idx + 1}`}" missing success indicators.`);
    });
    return { valid: reasons.length === 0, reasons };
  }, [analyzerSelected, effectiveTargetedActions]);

  const handleChange = (nextRaw) => {
    setRawInput(nextRaw);
    if (onDocUrlsChange) {
      // When parent cares, pass parsed set
      try {
  const arr = Array.from(
          new Set(
            String(nextRaw || '')
              .split(/\n|,|\s+/g)
              .map((s) => s.trim())
              .filter((s) => s && (s.startsWith('http://') || s.startsWith('https://')))
          )
  ).slice(0, 3);
        onDocUrlsChange(arr);
      } catch {}
    }
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg dark:bg-cp-panel-alt dark:border dark:border-cp-border">
      <h3 className="text-lg font-medium text-gray-900 mb-2 dark:text-neutral-100">AI Elements</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {AI_ELEMENTS.map((element) => {
          const checked = selectedElements.includes(element.id);
          const checkboxId = `${idPrefix}-ai-${element.id}`;
          return (
            <div key={element.id} className="flex items-start space-x-3">
              <input
                type="checkbox"
                id={checkboxId}
                checked={checked}
                onChange={() => onToggle && onToggle(element.id)}
                disabled={disabled}
                className={`mt-1 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              />
              <div className="flex-1">
                <label
                  htmlFor={checkboxId}
                  className={`block text-sm font-medium cursor-pointer dark:text-neutral-300 ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  {element.label}
                </label>
                <p className="text-xs text-gray-500 dark:text-neutral-500">{element.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional documentation sources for RAG */}
      {showRagInput && (
        <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-gray-900 dark:text-neutral-200">Knowledge sources (optional)</h4>
              <span className="text-[11px] text-gray-500 dark:text-neutral-500">URLs to crawl and embed for Lab Assistant and Session Analyzer (max 3)</span>
            </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${idPrefix}-rag-urls`} className="sr-only">Documentation URLs</label>
              <textarea
                id={`${idPrefix}-rag-urls`}
                rows={3}
                disabled={disabled}
                value={controlled ? (docUrls || []).join('\n') : rawInput}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="https://docs.example.com/guide\nhttps://example.com/faq (max 3)"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 text-sm ${
                  disabled
                    ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed dark:bg-cp-panel-alt dark:border-cp-border'
                    : 'bg-white border-gray-300 dark:bg-cp-panel dark:border-cp-border dark:text-neutral-200'
                }`}
              />
            </div>
            <div className="text-xs text-gray-600 dark:text-neutral-400">
              <div className="mb-1 font-medium">Detected URLs ({Math.min(validUrlCount, 3)}/3)</div>
              {parsedUrls.length ? (
                <div className="flex flex-wrap gap-1">
                  {parsedUrls.map((u) => (
                    <span key={u} className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[11px] text-green-800 ring-1 ring-inset ring-green-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700" title={u}>
                      {u.length > 48 ? `${u.slice(0, 45)}…` : u}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-[11px]">Enter one URL per line (max 3). Only http(s) links are accepted.</div>
              )}
              {validUrlCount > 3 && (
                <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">Only the first 3 URLs will be used.</div>
              )}
            </div>
          </div>

          {/* Expose sources inline for downstream scrapers (JSON) */}
          <script
            id={`${idPrefix}-rag-sources`}
            type="application/json"
            data-purpose="rag-sources"
            dangerouslySetInnerHTML={{ __html: JSON.stringify({ urls: parsedUrls }) }}
          />
        </div>
      )}

      {/* Targeted Actions Configuration */}
      {analyzerSelected && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-gray-900 dark:text-neutral-200">Targeted Actions (Attempt → Success Signals)</h4>
            <span className="text-[11px] text-gray-500 dark:text-neutral-500">Define funnels to track user progress</span>
          </div>
          <div className="space-y-3">
            {effectiveTargetedActions.map((action, idx) => {
              const nameInvalid = !action.name.trim();
              const attemptInvalid = !action.attemptIndicators.length;
              const successInvalid = !action.successIndicators.length;
              return (
                <div key={action.id} className={`p-3 border rounded-lg space-y-2 dark:border-cp-border ${nameInvalid || attemptInvalid || successInvalid ? 'border-amber-400' : 'border-gray-200 dark:border-cp-border'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 dark:bg-emerald-800/30 dark:text-emerald-200">Action {idx + 1}</span>
                      {!action.name.trim() && <span className="text-[10px] text-amber-600">Name required</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAction(action.id)}
                      disabled={disabled}
                      className="text-[11px] text-red-600 hover:underline disabled:opacity-40"
                    >Remove</button>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium flex items-center gap-1 text-gray-600 dark:text-neutral-400">Name<span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        disabled={disabled}
                        value={action.name}
                        onChange={(e) => updateAction(action.id, 'name', e.target.value)}
                        placeholder="e.g., Run Server"
                        className={`w-full px-2 py-1.5 border rounded text-[12px] focus:ring-2 ${nameInvalid ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-green-500 focus:border-green-500 dark:border-cp-border dark:bg-cp-panel dark:text-neutral-200'}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium flex items-center gap-1 text-gray-600 dark:text-neutral-400">Attempt Indicators<span className="text-red-500">*</span></label>
                      <textarea
                        rows={3}
                        disabled={disabled}
                        value={action.attemptIndicators.join(', ')}
                        onChange={(e) => updateAction(action.id, 'attemptIndicators', e.target.value)}
                        placeholder="uvicorn, go run, node server.js"
                        className={`w-full px-2 py-1.5 border rounded font-mono text-[11px] focus:ring-2 ${attemptInvalid ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-green-500 focus:border-green-500 dark:border-cp-border dark:bg-cp-panel dark:text-neutral-200'}`}
                      />
                      {attemptInvalid && <div className="text-[10px] text-red-600">Required.</div>}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium flex items-center gap-1 text-gray-600 dark:text-neutral-400">Success Indicators<span className="text-red-500">*</span></label>
                      <textarea
                        rows={3}
                        disabled={disabled}
                        value={action.successIndicators.join(', ')}
                        onChange={(e) => updateAction(action.id, 'successIndicators', e.target.value)}
                        placeholder="Uvicorn running on, 200 OK, Server started"
                        className={`w-full px-2 py-1.5 border rounded font-mono text-[11px] focus:ring-2 ${successInvalid ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-green-500 focus:border-green-500 dark:border-cp-border dark:bg-cp-panel dark:text-neutral-200'}`}
                      />
                      {successInvalid && <div className="text-[10px] text-red-600">Required.</div>}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium flex items-center gap-1 text-gray-600 dark:text-neutral-400">Notes (optional)</label>
                    <textarea
                      rows={2}
                      disabled={disabled}
                      value={action.notes || ''}
                      onChange={(e) => updateAction(action.id, 'notes', e.target.value)}
                      placeholder="Context or rationale for this action"
                      className="w-full px-2 py-1.5 border rounded text-[11px] border-gray-300 focus:ring-green-500 focus:border-green-500 dark:border-cp-border dark:bg-cp-panel dark:text-neutral-200"
                    />
                  </div>
                </div>
              );
            })}
            <div>
              <button
                type="button"
                onClick={addAction}
                disabled={disabled}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                + Add Action
              </button>
            </div>
          </div>
          <div className="text-[11px] text-gray-600 dark:text-neutral-500 space-y-1">
            <p><span className="font-medium">How it works:</span> Each action tracks transition from attempt to success based on indicator matches in session events (terminal input/output, editor edits, assistant insertions).</p>
            <p>Provide high-signal substrings only (case-insensitive contains). Max 32 indicators per list. Duplicates removed automatically.</p>
            {!actionsValidation.valid && (
              <div className="text-red-600 dark:text-red-400">
                <span className="font-medium">Validation:</span> {actionsValidation.reasons.join(' ')}
              </div>
            )}
          </div>
          {/* Expose targeted actions JSON for downstream consumption */}
          <script
            id={`${idPrefix}-targeted-actions`}
            type="application/json"
            data-purpose="targeted-actions"
            dangerouslySetInnerHTML={{ __html: JSON.stringify({ targeted_actions: effectiveTargetedActions }) }}
          />
        </div>
      )}
    </div>
  );
};
