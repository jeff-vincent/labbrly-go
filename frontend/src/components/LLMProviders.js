import React, { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

// A visual placeholder indicating a stored secret without revealing it
const MASK = '••••••••••••••••';

export default function LLMProviders({ llmConfigs }) {
  const { getAccessTokenSilently } = useAuth0();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    openai_api_key: '',
    openai_model: 'gpt-4o-mini',
    anthropic_api_key: '',
    anthropic_model: 'claude-3-5-sonnet-latest',
    azure_openai_api_key: '',
    azure_openai_endpoint: '',
    azure_openai_deployment: '',
    selected_llm_provider: '', // none by default
  });

  // Initialize the form from org's existing llmConfigs
  useEffect(() => {
    if (!llmConfigs || !llmConfigs.provider) return;
    const provider = llmConfigs.provider;
    if (provider === 'openai') {
      setForm((prev) => ({
        ...prev,
        selected_llm_provider: 'openai',
        openai_model: llmConfigs.model || prev.openai_model,
        openai_api_key: llmConfigs.api_key ? MASK : '',
      }));
    } else if (provider === 'anthropic') {
      setForm((prev) => ({
        ...prev,
        selected_llm_provider: 'anthropic',
        anthropic_model: llmConfigs.model || prev.anthropic_model,
        anthropic_api_key: llmConfigs.api_key ? MASK : '',
      }));
    } else if (provider === 'azure_openai') {
      setForm((prev) => ({
        ...prev,
        selected_llm_provider: 'azure_openai',
        azure_openai_endpoint: llmConfigs.endpoint || prev.azure_openai_endpoint,
        azure_openai_deployment: llmConfigs.deployment || prev.azure_openai_deployment,
        azure_openai_api_key: llmConfigs.api_key ? MASK : '',
      }));
    }
  }, [llmConfigs]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target || {};
    if (!name) return;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? !!checked : value,
    }));
  };

  const save = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const token = await getAccessTokenSilently({ audience: process.env.REACT_APP_AUTH0_AUDIENCE });
      // Build payload as { llm_model, llm_configs } based on selected provider
      const { selected_llm_provider } = form;

      let llm_configs = {};
      if (selected_llm_provider === 'openai') {
        llm_configs = {
          provider: 'openai',
          model: form.openai_model || '',
        };
        if (form.openai_api_key && form.openai_api_key !== MASK) {
          llm_configs.api_key = form.openai_api_key;
        }
      } else if (selected_llm_provider === 'anthropic') {
        llm_configs = {
          provider: 'anthropic',
          model: form.anthropic_model || '',
        };
        if (form.anthropic_api_key && form.anthropic_api_key !== MASK) {
          llm_configs.api_key = form.anthropic_api_key;
        }
      } else if (selected_llm_provider === 'azure_openai') {
        llm_configs = {
          provider: 'azure_openai',
          endpoint: form.azure_openai_endpoint || '',
          deployment: form.azure_openai_deployment || '',
        };
        if (form.azure_openai_api_key && form.azure_openai_api_key !== MASK) {
          llm_configs.api_key = form.azure_openai_api_key;
        }
      }

      const payload = {'llm_configs': llm_configs};

      const res = await fetch('/orgs/org', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || res.statusText);
      }
      setSuccess('Saved');
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg border dark:bg-cp-panel dark:border-cp-border">
      <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-neutral-200">LLM Providers</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Provider selector */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Selected LLM Provider</label>
          <select
            name="selected_llm_provider"
            value={form.selected_llm_provider || ''}
            onChange={onChange}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-cp-panel-alt dark:border-cp-border"
          >
            <option value="">None</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="azure_openai">Azure OpenAI</option>
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">Choose a provider to configure required fields.</p>
        </div>

        {/* Conditional fields */}
        {form.selected_llm_provider === 'openai' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300">OpenAI API Key</label>
              <input
                name="openai_api_key"
                type="password"
                required
                value={form.openai_api_key || ''}
                onChange={onChange}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-cp-panel-alt dark:border-cp-border"
                placeholder="sk-..."
              />
              {form.openai_api_key === MASK && (
                <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">A key is already set. Enter a new one to replace.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300">OpenAI Default Model</label>
              <input
                name="openai_model"
                required
                value={form.openai_model || ''}
                onChange={onChange}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-cp-panel-alt dark:border-cp-border"
                placeholder="gpt-4o-mini"
              />
            </div>
          </>
        )}

        {form.selected_llm_provider === 'anthropic' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Anthropic API Key</label>
              <input
                name="anthropic_api_key"
                type="password"
                required
                value={form.anthropic_api_key || ''}
                onChange={onChange}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-cp-panel-alt dark:border-cp-border"
                placeholder="sk-ant-..."
              />
              {form.anthropic_api_key === MASK && (
                <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">A key is already set. Enter a new one to replace.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Anthropic Default Model</label>
              <input
                name="anthropic_model"
                required
                value={form.anthropic_model || ''}
                onChange={onChange}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-cp-panel-alt dark:border-cp-border"
                placeholder="claude-3-5-sonnet-latest"
              />
            </div>
          </>
        )}

        {form.selected_llm_provider === 'azure_openai' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Azure OpenAI API Key</label>
              <input
                name="azure_openai_api_key"
                type="password"
                required
                value={form.azure_openai_api_key || ''}
                onChange={onChange}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-cp-panel-alt dark:border-cp-border"
                placeholder="..."
              />
              {form.azure_openai_api_key === MASK && (
                <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">A key is already set. Enter a new one to replace.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Azure Endpoint</label>
              <input
                name="azure_openai_endpoint"
                required
                value={form.azure_openai_endpoint || ''}
                onChange={onChange}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-cp-panel-alt dark:border-cp-border"
                placeholder="https://<resource>.openai.azure.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Azure Deployment</label>
              <input
                name="azure_openai_deployment"
                required
                value={form.azure_openai_deployment || ''}
                onChange={onChange}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-cp-panel-alt dark:border-cp-border"
                placeholder="gpt-4o-mini"
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
  <button onClick={save} disabled={loading} className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50">Save</button>
        {loading && <span className="text-sm text-gray-500">Saving…</span>}
        {success && <span className="text-sm text-green-600">{success}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
