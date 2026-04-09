import React, { useState, useEffect } from 'react';
import classNames from 'classnames';
import CMS from './CMS'
import Header from './Header';
import Upgrade from './Upgrade';
import LLMProviders from './LLMProviders';
import Integrations from './Integrations';
import Metrics from './Metrics';
import { useAuth0 } from '@auth0/auth0-react';
import { jwtDecode } from 'jwt-decode';
import BuildImage from './BuildImage';
import NamespaceEditor from './NamespaceEditor'; // new import

const OrgPortalLayout = () => {
  const { isAuthenticated, getAccessTokenSilently, isLoading } = useAuth0();
  // Define navigation items with inline SVG icons (keeping bundle small / no new deps)
  const navItems = [
    {
      key: 'Org Info',
      label: 'Org Info',
      icon: (active) => (
        <svg
          className={classNames('h-5 w-5', active ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600 dark:text-neutral-500 dark:group-hover:text-neutral-300')}
          fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          <path d="M3 21V7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v12" />
          <path d="M3 21h18" />
        </svg>
      ),
    },
    {
      key: 'Labs',
      label: 'Labs',
      icon: (active) => (
        <svg
          className={classNames('h-5 w-5', active ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600 dark:text-neutral-500 dark:group-hover:text-neutral-300')}
          fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
        >
          <path d="M8 3h8" />
          <path d="M10 3v3.6c0 .3-.08.6-.23.87L6.4 16.5c-.6 1.16.24 2.5 1.54 2.5h8.12c1.3 0 2.14-1.34 1.54-2.5L14.23 7.47A2 2 0 0 1 14 6.6V3" />
          <path d="M9 12h6" />
          <path d="M8.5 16h7" />
        </svg>
      ),
    },
    {
      key: 'Custom Envs',
      label: 'Custom Envs',
      icon: (active) => (
        <svg
          className={classNames('h-5 w-5', active ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600 dark:text-neutral-500 dark:group-hover:text-neutral-300')}
          fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
        >
          <path d="M12 3v18M3 12h18" />
        </svg>
      ),
    },
    {
      key: 'Analytics',
      label: 'Analytics',
      icon: (active) => (
        <svg
          className={classNames('h-5 w-5', active ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600 dark:text-neutral-500 dark:group-hover:text-neutral-300')}
          fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
        >
          <path d="M4 19V9M9 19V5M14 19v-8M19 19V11" />
        </svg>
      ),
    },
    {
      key: 'API Keys',
      label: 'API Keys',
      icon: (active) => (
        <svg
          className={classNames('h-5 w-5', active ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600 dark:text-neutral-500 dark:group-hover:text-neutral-300')}
          fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
        >
          {/* Simple key: circle bow + shaft + perpendicular teeth */}
          <circle cx="7" cy="12" r="4" />
          <circle cx="7" cy="12" r="1.4" />
          {/* Shaft */}
          <path d="M11 12h8" />
          {/* Teeth at tip */}
          <path d="M19 12v3" />
          <path d="M17 12v2" />
        </svg>
      ),
    },
    {
      key: 'Integrations',
      label: 'Integrations',
      icon: (active) => (
        <svg
          className={classNames('h-5 w-5', active ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600 dark:text-neutral-500 dark:group-hover:text-neutral-300')}
          fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
        >
          <path d="M8 3h8l1 4H7l1-4ZM5 7h14v7a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6V7Z" />
        </svg>
      ),
    },
    {
      key: 'Upgrade Plan',
      label: 'Upgrade',
      icon: (active) => (
        <svg
          className={classNames('h-5 w-5', active ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600 dark:text-neutral-500 dark:group-hover:text-neutral-300')}
          fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
        >
          <path d="M12 3l7 6h-4v8h-6v-8H5l7-6Z" />
        </svg>
      ),
    },
  ];
  const [activeTab, setActiveTab] = useState('Labs');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [apiKeys, setApiKeys] = useState([]);
  const [orgInfo, setOrgInfo] = useState({ name: '', billingEmail: '' });
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newGeneratedKey, setNewGeneratedKey] = useState('');
  const [customEnvsEnabled, setCustomEnvsEnabled] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [customEnvsSubTab, setCustomEnvsSubTab] = useState('Images'); // new sub-tab state
  const [orgData, setOrgData] = useState(null); // full org payload for Org Info
  const [orgLoading, setOrgLoading] = useState(true); // splash until org loads

  // Helper: parse Mongo extended date
  const parseExtendedDate = (val) => {
    if (!val) return null;
    if (typeof val === 'string' || typeof val === 'number') return new Date(val);
    const n =
      (val.$date && (val.$date.$numberLong || val.$date)) ||
      val.$numberLong ||
      null;
    return n ? new Date(parseInt(n, 10)) : null;
  };
  const fmt = (d) => (d ? d.toLocaleString() : '—');

  // Fetch organization data
  useEffect(() => {
    const fetchOrgData = async () => {
      try {
        const token = await getAccessTokenSilently({
          audience: 'urn:labthingy:api',
        });
        
        const response = await fetch('/orgs/org', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const orgData = await response.json();
          console.log('Org Data:', orgData);
          setOrgData(orgData); // store full payload
          setOrgInfo({ 
            name: orgData.organization_name || '', 
            billingEmail: orgData.email || '' 
          });
          
          // Transform array of strings to array of objects
          const transformedKeys = (orgData.api_keys || []).map(keyString => ({
            id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `key-${Math.random().toString(36).slice(2)}`,
            key: keyString,
            createdAt: new Date().toISOString().split('T')[0] // Use current date as placeholder
          }));
          setApiKeys(transformedKeys);

          // enable/disable Custom Envs based on account_type
          const acct = (orgData.account_type || '').toLowerCase();
          const enabled = acct === 'business' || acct === 'premium';
          setCustomEnvsEnabled(enabled);
          setAnalyticsEnabled(enabled);
          // if currently on Custom Envs but not allowed, bounce back to Labs
          setActiveTab(prev => (prev === 'Custom Envs' && !enabled ? 'Labs' : prev));
          setActiveTab(prev => (prev === 'Analytics' && !enabled ? 'Labs' : prev));

          setIsAuthorized(true);
          setOrgLoading(false);
        } else {
          console.error('Failed to fetch org data:', response.statusText);
          setIsAuthorized(false);
          setOrgLoading(false);
        }
      } catch (error) {
        console.error('Error fetching org data:', error);
        setIsAuthorized(false);
        setOrgLoading(false);
      }
    };

    if (isAuthenticated && !isLoading) {
      fetchOrgData();
    }
  }, [getAccessTokenSilently, isAuthenticated, isLoading]);

  const issueNewKey = async () => {
    const keyValue = 'sk_live_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const newKey = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `key-${Math.random().toString(36).slice(2)}`,
      key: keyValue,
      createdAt: new Date().toISOString().split('T')[0]
    };
    const updatedKeys = [...apiKeys, newKey];
    setApiKeys(updatedKeys);
    setNewGeneratedKey(keyValue);
    setShowKeyModal(true);

    try {
      const token = await getAccessTokenSilently({
        audience: 'urn:labthingy:api',
      });
      
      await fetch('/orgs/org', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_keys: updatedKeys.map(key => key.key)
        })
      });
    } catch (error) {
      console.error('Error updating API keys:', error);
    }
  };

  const revokeKey = async (keyId) => {
    const updatedKeys = apiKeys.filter(key => key.id !== keyId);
    setApiKeys(updatedKeys);

    try {
      const token = await getAccessTokenSilently({
        audience: 'urn:labthingy:api',
      });
      
      await fetch('/orgs/org', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_keys: updatedKeys.map(key => key.key)
        })
      });
    } catch (error) {
      console.error('Error updating API keys:', error);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(newGeneratedKey);
  };

  const closeModal = () => {
    setShowKeyModal(false);
    setNewGeneratedKey('');
  };

  const maskKey = (key) => {
    return key.substring(0, 8) + '*'.repeat(key.length - 12) + key.substring(key.length - 4);
  };

  const renderTabContent = () => {
    if (!isAuthorized) {
      return <div className="text-center text-gray-400 italic">Loading...</div>;
    }

    switch (activeTab) {
      case 'Org Info':
  // derive display fields safely from orgData
        const displayName = orgData?.organization_display_name || '—';
        const orgName = orgData?.organization_name || '—';
        const orgId = orgData?.org_id || '—';
        const accountType = (orgData?.account_type || '—').toString();
        const email = orgData?.email || '—';
        const username = orgData?.username || '—';
        const createdAt = fmt(parseExtendedDate(orgData?.created_at));
        const updatedAt = fmt(parseExtendedDate(orgData?.updated_at));
        const apiKeyCount = Array.isArray(orgData?.api_keys) ? orgData.api_keys.length : 0;
        const usersObj = orgData?.users || {};
        const usersCount = Object.keys(usersObj).length;

        // recent events (up to 5)
        const recentEvents = (() => {
          const evts = [];
          Object.entries(usersObj).forEach(([uid, eventsMap]) => {
            Object.entries(eventsMap || {}).forEach(([iso, payload]) => {
              const ts = new Date(iso);
              if (!isNaN(ts)) {
                evts.push({
                  ts,
                  iso,
                  user: uid,
                  event: payload?.event || '',
                  labId: payload?.lab_id || '',
                });
              }
            });
          });
          evts.sort((a, b) => b.ts - a.ts);
          return evts.slice(0, 5);
        })();

        return (
          <div className="bg-white p-6 rounded-lg shadow-md space-y-6 text-gray-700 dark:bg-cp-panel dark:border dark:border-cp-border dark:text-neutral-300 dark:shadow-cp">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white shadow-md rounded-lg p-6 dark:bg-cp-panel-alt dark:border dark:border-cp-border">
                <p className="text-sm font-semibold text-gray-800 mb-1">Organization</p>
                <div className="text-sm"><span className="text-gray-500">Display Name:</span> {displayName}</div>
                <div className="text-sm"><span className="text-gray-500">Name (slug):</span> {orgName}</div>
              </div>

              <div className="bg-white shadow-md rounded-lg p-6 dark:bg-cp-panel-alt dark:border dark:border-cp-border">
                <p className="text-sm font-semibold text-gray-800 mb-1">Identifiers</p>
                <div className="text-sm"><span className="text-gray-500">Org ID:</span> <code className="font-mono">{orgId}</code></div>
                <div className="mt-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border"
                  title="Account type">
                  <span className={
                    `mr-2 h-2 w-2 rounded-full ${
                      accountType === 'business' || accountType === 'premium' ? 'bg-emerald-500' : 'bg-gray-400'
                    }`
                  } />
                  {accountType}
                </div>
              </div>

              <div className="bg-white shadow-md rounded-lg p-6 dark:bg-cp-panel-alt dark:border dark:border-cp-border">
                <p className="text-sm font-semibold text-gray-800 mb-1">Contact</p>
                <div className="text-sm"><span className="text-gray-500">Email:</span> {email}</div>
                <div className="text-sm"><span className="text-gray-500">Username:</span> {username}</div>
              </div>

              <div className="bg-white shadow-md rounded-lg p-6 dark:bg-cp-panel-alt dark:border dark:border-cp-border">
                <p className="text-sm font-semibold text-gray-800 mb-1">Timestamps</p>
                <div className="text-sm"><span className="text-gray-500">Created:</span> {createdAt}</div>
                <div className="text-sm"><span className="text-gray-500">Updated:</span> {updatedAt}</div>
              </div>

              <div className="bg-white shadow-md rounded-lg p-6 dark:bg-cp-panel-alt dark:border dark:border-cp-border">
                <p className="text-sm font-semibold text-gray-800 mb-2">Usage</p>
                <div className="text-sm"><span className="text-gray-500">API Keys:</span> {apiKeyCount}</div>
                <div className="text-sm"><span className="text-gray-500">Users:</span> {usersCount}</div>
              </div>

              <div className="bg-white shadow-md rounded-lg p-6 md:col-span-1 dark:bg-cp-panel-alt dark:border dark:border-cp-border">
                <p className="text-sm font-semibold text-gray-800 mb-2">Recent Events</p>
                {recentEvents.length === 0 ? (
                  <div className="text-sm text-gray-500">No recent events.</div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {recentEvents.map((e, i) => (
                      <li key={i} className="py-2 text-sm flex items-center justify-between">
                        <div>
                          <div className="text-gray-900">{e.event || 'event'}</div>
                          <div className="text-xs text-gray-500">
                            user: <code className="font-mono">{e.user}</code>
                            {e.labId ? <> • lab: <code className="font-mono">{e.labId}</code></> : null}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">{e.ts.toLocaleString()}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );

      case 'Labs':
        return (
          <div className="bg-white p-6 rounded-lg shadow-md dark:bg-cp-panel dark:border dark:border-cp-border">
            <CMS/>
          </div>
        );

      case 'Custom Envs':
        if (!customEnvsEnabled) return null;
        return (
          <div className="bg-white p-6 rounded-lg shadow-md dark:bg-cp-panel dark:border dark:border-cp-border">
            <div className="flex flex-wrap gap-2 border-b pb-2 mb-4 sm:mb-6 text-gray-700 dark:border-cp-border">
              <button
                onClick={() => setCustomEnvsSubTab('Images')}
                className={classNames(
                  'px-4 py-2 text-sm font-medium rounded-full transition',
                  customEnvsSubTab === 'Images'
                    ? 'bg-green-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-cp-panel-alt'
                )}
              >
                Images
              </button>
              <button
                onClick={() => setCustomEnvsSubTab('Namespace')}
                className={classNames(
                  'px-4 py-2 text-sm font-medium rounded-full transition',
                  customEnvsSubTab === 'Namespace'
                    ? 'bg-green-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-cp-panel-alt'
                )}
              >
                Namespace
              </button>
            </div>

            <div className="mt-4 sm:mt-6">
              {customEnvsSubTab === 'Images' ? (
                <BuildImage />
              ) : (
                <NamespaceEditor />
              )}
            </div>
          </div>
        );

      case 'API Keys':
        return (
          <div className="bg-white p-6 rounded-lg shadow-md space-y-6 dark:bg-cp-panel dark:border dark:border-cp-border">
            <LLMProviders llmConfigs={orgData?.llm_configs} />
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-neutral-200">Issued API Keys</h3>
                <button
                  onClick={issueNewKey}
                  className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Issue New Key
                </button>
              </div>
            </div>
            <ul className="space-y-3">
              {apiKeys.map((key) => (
                <li
                  key={key.id}
                  className="flex justify-between items-center p-4 bg-white border border-slate-200 rounded-lg dark:bg-cp-panel-alt dark:border-cp-border"
                >
                  <div className="flex items-center space-x-4">
                    <code className="text-gray-800 font-mono">{maskKey(key.key)}</code>
                    <span className="text-sm text-gray-500">{key.createdAt}</span>
                  </div>
                  <button
                    onClick={() => revokeKey(key.id)}
                    className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>

            {/* Key Generation Modal */}
            {showKeyModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4 dark:bg-cp-panel dark:border dark:border-cp-border">
                  <h3 className="text-lg font-semibold mb-4 text-gray-800">New API Key Generated</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    This key will only be shown once. Please copy it now and store it securely.
                  </p>
                  <div className="bg-gray-100 p-3 rounded border mb-4">
                    <code className="text-sm font-mono break-all">{newGeneratedKey}</code>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={copyToClipboard}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex-1"
                    >
                      Copy to Clipboard
                    </button>
                    <button
                      onClick={closeModal}
                      className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'Integrations':
        return (
          <div className="bg-white p-6 rounded-lg shadow-md space-y-6 dark:bg-cp-panel dark:border dark:border-cp-border">
            <Integrations initial={orgData?.integrations || {}} />
          </div>
        );

      case 'Upgrade Plan':
        return (
          <div className="bg-white p-6 rounded-lg shadow-md dark:bg-cp-panel dark:border dark:border-cp-border">
            <Upgrade />
          </div>
        );

      case 'Analytics':
        if (!analyticsEnabled) return null;
        return (
          <div className="bg-white p-6 rounded-lg shadow-md dark:bg-cp-panel dark:border dark:border-cp-border">
            <Metrics />
          </div>
        );

      default:
        return null;
    }
  };

  return (
  <div className="min-h-screen px-4 sm:px-8 py-6 dark:bg-cp-bg">
      <div className="mb-4 sm:mb-6">
        <Header />
      </div>

      {/* Splash screen while org type loads (hide tabs and premium callouts) */}
      {(isLoading || (isAuthenticated && orgLoading)) ? (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="loading-spinner mx-auto mb-4" />
            <p className="text-gray-500 dark:text-neutral-400">Loading your organization…</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-6 mt-2">
            {/* Sidebar */}
            <nav
              aria-label="Organization navigation"
              className="hidden md:flex md:flex-col w-60 shrink-0 rounded-2xl border border-gray-200 bg-white/70 backdrop-blur-sm shadow-sm dark:border-cp-border dark:bg-cp-panel/80"
            >
              <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-cp-border/60">
                <h2 className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-neutral-400">Organization</h2>
              </div>
              <ul className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
                {navItems.map(item => {
                  const disabled = (item.key === 'Custom Envs' && !customEnvsEnabled) || (item.key === 'Analytics' && !analyticsEnabled);
                  const active = activeTab === item.key;
                  return (
                    <li key={item.key}>
                      <button
                        onClick={() => {
                          if (!disabled) setActiveTab(item.key);
                        }}
                        disabled={disabled}
                        aria-current={active ? 'page' : undefined}
                        aria-label={item.label}
                        className={classNames(
                          'group relative w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-cp-bg transition shadow-sm',
                          active
                            ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : 'text-gray-600 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-cp-panel-alt',
                          disabled && 'opacity-40 cursor-not-allowed'
                        )}
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-white ring-1 ring-gray-200 group-hover:ring-green-200 dark:bg-cp-panel dark:ring-cp-border dark:group-hover:ring-green-700/40">
                          {item.icon(active)}
                        </span>
                        <span className="truncate">{item.label}</span>
                        {(item.key === 'Custom Envs' && !customEnvsEnabled) && (
                          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide rounded bg-amber-100 text-amber-700 px-1.5 py-0.5">Premium</span>
                        )}
                        {(item.key === 'Analytics' && !analyticsEnabled) && (
                          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide rounded bg-amber-100 text-amber-700 px-1.5 py-0.5">Premium</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-auto px-4 py-3 border-t border-gray-100 dark:border-cp-border/60 text-[11px] text-gray-400 dark:text-neutral-500">
                <p className="truncate">Portal</p>
              </div>
            </nav>
            {/* Mobile horizontal nav fallback */}
            <div className="md:hidden -mx-2 mb-4 overflow-x-auto pb-2">
              <div className="flex gap-2 px-2">
                {navItems.map(item => {
                  const disabled = (item.key === 'Custom Envs' && !customEnvsEnabled) || (item.key === 'Analytics' && !analyticsEnabled);
                  const active = activeTab === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => { if (!disabled) setActiveTab(item.key); }}
                      disabled={disabled}
                      className={classNames(
                        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition',
                        active
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white border-gray-200 text-gray-600 dark:bg-cp-panel dark:border-cp-border dark:text-neutral-300',
                        disabled && 'opacity-40'
                      )}
                    >
                      {item.icon(active)}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Main content area */}
            <div className="flex-1 min-w-0">
              {/* Premium callout for disabled Custom Envs */}
              {isAuthorized && !customEnvsEnabled && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start justify-between dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300">
                  <div>
                    <span className="font-medium">Custom Envs</span> is a premium feature. Upgrade to Business or Premium to enable custom environments.
                  </div>
                  <button
                    onClick={() => setActiveTab('Upgrade Plan')}
                    className="ml-4 whitespace-nowrap bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded"
                  >
                    Upgrade
                  </button>
                </div>
              )}
              <div className="transition-opacity duration-300 ease-in-out">
                {renderTabContent()}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OrgPortalLayout;
