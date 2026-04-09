import React, { useMemo, useState, useEffect } from "react";

// Small reusable editor for key/value pairs
function KeyValueEditor({ label, pairs, setPairs, keyPlaceholder = "KEY", valuePlaceholder = "value", valueType = "text" }) {
  const updatePair = (idx, field, val) => {
    const next = pairs.map((p, i) => (i === idx ? { ...p, [field]: val } : p));
    setPairs(next);
  };
  const addPair = () => setPairs([...pairs, { key: "", value: "" }]);
  const removePair = (idx) => setPairs(pairs.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
  <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300">{label}</label>
  <button type="button" onClick={addPair} className="text-green-600 dark:text-green-500 text-sm hover:underline">
          + Add
        </button>
      </div>
      <div className="space-y-2">
        {pairs.map((p, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2">
            <input
              type="text"
              className="col-span-4 px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 font-mono bg-white dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
              placeholder={keyPlaceholder}
              value={p.key}
              onChange={(e) => updatePair(idx, "key", e.target.value)}
            />
            <input
              type={valueType}
              className="col-span-7 px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 font-mono bg-white dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
              placeholder={valuePlaceholder}
              value={p.value}
              onChange={(e) => updatePair(idx, "value", e.target.value)}
            />
            <button
              type="button"
              onClick={() => removePair(idx)}
              className="col-span-1 px-3 py-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-cp-border dark:text-neutral-300 dark:hover:bg-cp-panel-alt"
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
        {pairs.length === 0 && (
          <div className="text-xs text-gray-500">No entries yet. Click “Add” to insert a key/value pair.</div>
        )}
      </div>
    </div>
  );
}

function SectionCard({ title, children, actions }) {
  return (
  <div className="bg-white/80 dark:bg-cp-panel border border-gray-200 dark:border-cp-border rounded-lg shadow-sm overflow-hidden backdrop-blur-sm">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-cp-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-200">{title}</h3>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
  <div className="p-4">{children}</div>
    </div>
  );
}

const toObjectFromPairs = (pairs) => {
  const obj = {};
  pairs.forEach(({ key, value }) => {
    if (!key) return;
    obj[key] = value ?? "";
  });
  return obj;
};

const clean = (obj) => {
  // Remove empty nested objects and undefined
  const o = JSON.parse(JSON.stringify(obj));
  Object.keys(o).forEach((k) => {
    const v = o[k];
    if (v == null) delete o[k];
    else if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) delete o[k];
  });
  return o;
};

const b64 = (str) => {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(str); // fallback
  }
};

const toYaml = (obj, indent = 0) => {
  const pad = "  ".repeat(indent);
  if (obj == null) return "";
  if (typeof obj !== "object") {
    // Simple scalar
    const s = String(obj);
    const needsQuote = /[:#\-\?\n\r\t]|^\s|\s$/.test(s);
    return needsQuote ? `"${s.replace(/"/g, '\\"')}"` : s;
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => `${pad}- ${toYaml(v, indent + 1).trimStart()}`).join("\n");
  }
  return Object.entries(obj)
    .map(([k, v]) => {
      const isObj = typeof v === "object" && v !== null;
      const child = toYaml(v, indent + 1);
      if (isObj) return `${pad}${k}:\n${child}`;
      return `${pad}${k}: ${child}`;
    })
    .join("\n");
};

export default function NamespaceEditor({ onSaveSecret, onSaveConfigMap }) {
  // Secret form state
  const [secName, setSecName] = useState("");
  const [secNamespace, setSecNamespace] = useState("");
  const [secType, setSecType] = useState("Opaque");
  const [secLabels, setSecLabels] = useState([]);
  const [secAnnotations, setSecAnnotations] = useState([]);
  const [secData, setSecData] = useState([]);
  const [secStringDataMode, setSecStringDataMode] = useState(true); // if true, use stringData; otherwise base64 encode into data

  // ConfigMap form state
  const [cmName, setCmName] = useState("");
  const [cmNamespace, setCmNamespace] = useState("");
  const [cmLabels, setCmLabels] = useState([]);
  const [cmAnnotations, setCmAnnotations] = useState([]);
  const [cmData, setCmData] = useState([]);

  // Secret manifest + YAML
  const secretManifest = useMemo(() => {
    const metadata = clean({
      name: secName || undefined,
      namespace: secNamespace || undefined,
      labels: toObjectFromPairs(secLabels),
      annotations: toObjectFromPairs(secAnnotations),
    });
    const base = {
      apiVersion: "v1",
      kind: "Secret",
      metadata,
      type: secType || "Opaque",
    };
    if (secStringDataMode) {
      return clean({
        ...base,
        stringData: toObjectFromPairs(secData),
      });
    }
    // data mode: base64 encode
    const raw = toObjectFromPairs(secData);
    const encoded = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, b64(v)]));
    return clean({
      ...base,
      data: encoded,
    });
  }, [secName, secNamespace, secType, secLabels, secAnnotations, secData, secStringDataMode]);

  const secretYaml = useMemo(() => toYaml(secretManifest), [secretManifest]);

  // ConfigMap manifest + YAML
  const configMapManifest = useMemo(() => {
    const metadata = clean({
      name: cmName || undefined,
      namespace: cmNamespace || undefined,
      labels: toObjectFromPairs(cmLabels),
      annotations: toObjectFromPairs(cmAnnotations),
    });
    return clean({
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata,
      data: toObjectFromPairs(cmData),
    });
  }, [cmName, cmNamespace, cmLabels, cmAnnotations, cmData]);

  const configMapYaml = useMemo(() => toYaml(configMapManifest), [configMapManifest]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.log("Copy failed:", e);
    }
  };

  const resetSecret = () => {
    setSecName(""); setSecNamespace(""); setSecType("Opaque");
    setSecLabels([]); setSecAnnotations([]); setSecData([]); setSecStringDataMode(true);
  };
  const resetConfigMap = () => {
    setCmName(""); setCmNamespace(""); setCmLabels([]); setCmAnnotations([]); setCmData([]);
  };

  const defaultSave = (label, manifest, yaml) => {
    console.log(`${label} manifest`, manifest);
    console.log(`${label} YAML\n${yaml}`);
  };

  // Namespace Explorer state
  const [explorerNamespace, setExplorerNamespace] = useState("");
  const [nsLoading, setNsLoading] = useState(false);
  const [nsErr, setNsErr] = useState(null);
  const [nsGroups, setNsGroups] = useState([]); // [{ kind, items: [...] }]
  const [nsSummary, setNsSummary] = useState({ total: 0, byKind: {} });
  const [nsFetchedAt, setNsFetchedAt] = useState(null);

  // Initialize explorer namespace from either Secret or ConfigMap namespace when empty
  useEffect(() => {
    if (!explorerNamespace && (secNamespace || cmNamespace)) {
      setExplorerNamespace(secNamespace || cmNamespace || "");
    }
  }, [explorerNamespace, secNamespace, cmNamespace]);

  const getAge = (iso) => {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "—";
    const diff = Math.max(0, Date.now() - t) / 1000;
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const normalizeNamespaceResponse = (json) => {
    // Accept a variety of shapes and normalize to array of items with kind + metadata
    let items = [];
    if (Array.isArray(json)) {
      items = json;
    } else if (Array.isArray(json?.items)) {
      items = json.items;
    } else if (Array.isArray(json?.resources)) {
      items = json.resources;
    } else if (json && typeof json === "object") {
      // Flatten object-of-arrays
      Object.values(json).forEach((v) => {
        if (Array.isArray(v)) items.push(...v);
      });
    }
    // Shape each item
    const shaped = items.map((it) => {
      const kind = it?.kind || it?.metadata?.kind || it?.type || "Resource";
      const meta = it?.metadata || {};
      const name = meta?.name || it?.name || "unknown";
      const ns = meta?.namespace || it?.namespace || explorerNamespace || "default";
      const creationTimestamp = meta?.creationTimestamp || it?.creationTimestamp || null;
      return { kind, name, namespace: ns, creationTimestamp, raw: it };
    });
    // Group by kind
    const byKind = shaped.reduce((acc, r) => {
      acc[r.kind] = acc[r.kind] || [];
      acc[r.kind].push(r);
      return acc;
    }, {});
    const groups = Object.keys(byKind)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => ({ kind: k, items: byKind[k].sort((a, b) => a.name.localeCompare(b.name)) }));
    const summary = {
      total: shaped.length,
      byKind: Object.fromEntries(Object.entries(byKind).map(([k, arr]) => [k, arr.length])),
    };
    return { groups, summary };
  };

  const describeNamespace = async () => {
    if (!explorerNamespace) {
      setNsErr("Namespace is required");
      return;
    }
    setNsLoading(true);
    setNsErr(null);
    try {
      const jwt = localStorage.getItem("jwt");
      const res = await fetch("/compute/describe-namespace", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ namespace: explorerNamespace }),
      });
      if (!res.ok) throw new Error(`Failed to describe namespace (${res.status})`);
      const json = await res.json();
      const { groups, summary } = normalizeNamespaceResponse(json);
      setNsGroups(groups);
      setNsSummary(summary);
      setNsFetchedAt(new Date());
    } catch (e) {
      setNsErr(e.message || "Failed to load namespace resources");
      setNsGroups([]);
      setNsSummary({ total: 0, byKind: {} });
    } finally {
      setNsLoading(false);
    }
  };

  // Sub-tabs for forms
  const [activeFormTab, setActiveFormTab] = useState('Kubernetes Secret');

  return (
  <div className="min-h-screen bg-white dark:bg-cp-bg py-6 px-4 transition-colors">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Namespace Explorer */}
        <SectionCard
          title="Namespace Explorer"
          actions={
            <>
              <button
                type="button"
                onClick={describeNamespace}
                className="px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white text-sm"
                disabled={nsLoading || !explorerNamespace}
              >
                {nsLoading ? "Loading…" : "Refresh"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Namespace</label>
                <input
                  type="text"
                  className="mt-1 w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 bg-white dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
                  placeholder="default"
                  value={explorerNamespace}
                  onChange={(e) => setExplorerNamespace(e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-cp-border dark:text-neutral-300 dark:hover:bg-cp-panel-alt"
                  onClick={() => setExplorerNamespace(secNamespace || "")}
                >
                  Use Secret NS
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-cp-border dark:text-neutral-300 dark:hover:bg-cp-panel-alt"
                  onClick={() => setExplorerNamespace(cmNamespace || "")}
                >
                  Use ConfigMap NS
                </button>
              </div>
            </div>

            {nsErr && <div className="text-sm text-red-600">{nsErr}</div>}

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                Total: {nsSummary.total}
              </span>
              {Object.entries(nsSummary.byKind).map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200"
                >
                  {k}: {v}
                </span>
              ))}
              {nsFetchedAt && (
                <span className="ml-auto text-xs text-gray-500">
                  Updated {nsFetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>

            {/* Groups */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {nsGroups.map((g) => (
                <div key={g.kind} className="border border-gray-200 dark:border-cp-border rounded-lg shadow-sm bg-white/80 dark:bg-cp-panel-alt overflow-hidden backdrop-blur-sm">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-cp-border flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-neutral-200">{g.kind}</h4>
                    <span className="text-xs text-gray-500">{g.items.length}</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {g.items.map((it, idx) => (
                      <li key={`${it.name}-${idx}`} className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{it.name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-700 mr-2">
                                ns/{it.namespace}
                              </span>
                              <span className="text-gray-500">age: {getAge(it.creationTimestamp)}</span>
                            </div>
                          </div>
                          <details className="ml-3">
                            <summary className="cursor-pointer text-xs text-green-600 hover:text-green-700">YAML</summary>
                            <pre className="mt-2 bg-gray-900 text-gray-100 rounded-md p-3 text-[11px] max-h-64 overflow-auto whitespace-pre">
{toYaml(it.raw)}
                            </pre>
                          </details>
                        </div>
                      </li>
                    ))}
                    {g.items.length === 0 && (
                      <li className="p-3 text-sm text-gray-500">No resources found for {g.kind}.</li>
                    )}
                  </ul>
                </div>
              ))}
              {nsGroups.length === 0 && !nsLoading && (
                <div className="col-span-full text-sm text-gray-500">No resources found. Try refreshing.</div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Form Tabs */}
  <div className="flex space-x-2 border-b pb-2 dark:border-cp-border">
          <button
            type="button"
            onClick={() => setActiveFormTab('Kubernetes Secret')}
            className={`px-4 py-2 text-sm font-medium rounded-full transition ${
              activeFormTab === 'Kubernetes Secret'
                ? 'bg-green-600 text-white shadow'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Kubernetes Secret
          </button>
          <button
            type="button"
            onClick={() => setActiveFormTab('Kubernetes ConfigMap')}
            className={`px-4 py-2 text-sm font-medium rounded-full transition ${
              activeFormTab === 'Kubernetes ConfigMap'
                ? 'bg-green-600 text-white shadow'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Kubernetes ConfigMap
          </button>
        </div>

        {/* Secret Form */}
        {activeFormTab === 'Kubernetes Secret' && (
          <SectionCard
            title="Kubernetes Secret"
            actions={
              <>
                <button
                  type="button"
                  onClick={() => copy(secretYaml)}
                  className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm dark:border-cp-border dark:text-neutral-300 dark:hover:bg-cp-panel-alt"
                >
                  Copy YAML
                </button>
                <button
                  type="button"
                  onClick={() => (onSaveSecret ? onSaveSecret(secretManifest, secretYaml) : defaultSave("Secret", secretManifest, secretYaml))}
                  className="px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white text-sm"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={resetSecret}
                  className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm dark:border-cp-border dark:text-neutral-300 dark:hover:bg-cp-panel-alt"
                >
                  Reset
                </button>
              </>
            }
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <input
                      type="text"
                      className="mt-1 w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 bg-white dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
                      placeholder="my-secret"
                      value={secName}
                      onChange={(e) => setSecName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Namespace</label>
                    <input
                      type="text"
                      className="mt-1 w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 bg-white dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
                      placeholder="default"
                      value={secNamespace}
                      onChange={(e) => setSecNamespace(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Type</label>
                    <input
                      type="text"
                      className="mt-1 w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Opaque"
                      value={secType}
                      onChange={(e) => setSecType(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={secStringDataMode}
                        onChange={(e) => setSecStringDataMode(e.target.checked)}
                      />
                      Use stringData (auto-encode on apply)
                    </label>
                  </div>
                </div>

                <KeyValueEditor
                  label="Labels"
                  pairs={secLabels}
                  setPairs={setSecLabels}
                  keyPlaceholder="app"
                  valuePlaceholder="web"
                />

                <KeyValueEditor
                  label="Annotations"
                  pairs={secAnnotations}
                  setPairs={setSecAnnotations}
                  keyPlaceholder="example.com/owner"
                  valuePlaceholder="team-a"
                />

                <KeyValueEditor
                  label="Data"
                  pairs={secData}
                  setPairs={setSecData}
                  keyPlaceholder="USERNAME"
                  valuePlaceholder="alice"
                  valueType="text"
                />
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">YAML Preview</label>
                <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-auto h-[32rem] text-xs whitespace-pre">
{secretYaml}
                </pre>
              </div>
            </div>
          </SectionCard>
        )}

        {/* ConfigMap Form */}
        {activeFormTab === 'Kubernetes ConfigMap' && (
          <SectionCard
            title="Kubernetes ConfigMap"
            actions={
              <>
                <button
                  type="button"
                  onClick={() => copy(configMapYaml)}
                  className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm dark:border-cp-border dark:text-neutral-300 dark:hover:bg-cp-panel-alt"
                >
                  Copy YAML
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onSaveConfigMap ? onSaveConfigMap(configMapManifest, configMapYaml) : defaultSave("ConfigMap", configMapManifest, configMapYaml)
                  }
                  className="px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white text-sm"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={resetConfigMap}
                  className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm dark:border-cp-border dark:text-neutral-300 dark:hover:bg-cp-panel-alt"
                >
                  Reset
                </button>
              </>
            }
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <input
                      type="text"
                      className="mt-1 w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 bg-white dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
                      placeholder="my-config"
                      value={cmName}
                      onChange={(e) => setCmName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Namespace</label>
                    <input
                      type="text"
                      className="mt-1 w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 bg-white dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
                      placeholder="default"
                      value={cmNamespace}
                      onChange={(e) => setCmNamespace(e.target.value)}
                    />
                  </div>
                </div>

                <KeyValueEditor
                  label="Labels"
                  pairs={cmLabels}
                  setPairs={setCmLabels}
                  keyPlaceholder="app"
                  valuePlaceholder="web"
                />

                <KeyValueEditor
                  label="Annotations"
                  pairs={cmAnnotations}
                  setPairs={setCmAnnotations}
                  keyPlaceholder="example.com/owner"
                  valuePlaceholder="team-a"
                />

                <KeyValueEditor
                  label="Data"
                  pairs={cmData}
                  setPairs={setCmData}
                  keyPlaceholder="config.json"
                  valuePlaceholder='{"env":"prod"}'
                />
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">YAML Preview</label>
                <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-auto h-[32rem] text-xs whitespace-pre">
{configMapYaml}
                </pre>
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
