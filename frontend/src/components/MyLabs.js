import React, { useEffect, useState, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

// Lists all labs for the authenticated org member with a Launch button for each
const MyLabs = () => {
  const { getAccessTokenSilently } = useAuth0();
  const [jwt, setJwt] = useState(null);
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [launchingId, setLaunchingId] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const token = await getAccessTokenSilently({ audience: process.env.REACT_APP_AUTH0_AUDIENCE });
        setJwt(token);
        const res = await fetch('/labs', {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to fetch labs (${res.status})`);
        const data = await res.json();
        setLabs(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('MyLabs: error fetching labs', e);
        setError(e.message || 'Failed to load labs');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [getAccessTokenSilently]);

  const customLabs = useMemo(() => labs.filter(l => !!l.custom_lab), [labs]);
  const presetLabs = useMemo(() => labs.filter(l => !l.custom_lab), [labs]);

  const launchLab = async (labId) => {
    setLaunchingId(labId);
    setError(null);
    try {
      // 1) Auth0 token for org lookup
      const token = jwt || (await getAccessTokenSilently({ audience: process.env.REACT_APP_AUTH0_AUDIENCE }));

      // 2) Fetch org to obtain API key
      const orgRes = await fetch('/orgs/org', {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!orgRes.ok) throw new Error(`Failed to fetch org (${orgRes.status})`);
      const org = await orgRes.json();
      const apiKey = Array.isArray(org.api_keys) && org.api_keys.length > 0 ? org.api_keys[0] : null;
      if (!apiKey) throw new Error('No API key found on your organization. Issue an API key first.');

      // 3) Exchange for a lab access token
      const tokRes = await fetch('/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lab_id: labId, api_key: apiKey }),
      });
      if (!tokRes.ok) {
        const txt = await tokRes.text();
        throw new Error(txt || `Failed to get lab token (${tokRes.status})`);
      }
      const tokData = await tokRes.json();
      const accessToken = tokData?.access_token;
      if (!accessToken) throw new Error('No access token returned');

      // 4) Open new tab to environment with token in URL (matches NewLab flow)
      const url = `${window.location.origin}/?token=${encodeURIComponent(accessToken)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error('MyLabs: launch error', e);
      setError(e.message || 'Failed to launch lab');
    } finally {
      setLaunchingId(null);
    }
  };

  const EmptyState = () => (
    <div className="text-center text-gray-500 py-8 dark:text-neutral-400">
      No labs found. Create one in the Create Lab tab.
    </div>
  );

  const LabList = ({ title, items }) => (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700 mt-2 mb-1 dark:text-neutral-300">{title}</h4>
      {items.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-neutral-400">None</div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-cp-border">
          {items.map(lab => (
            <li key={lab._id} className="py-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate dark:text-neutral-100">{lab.name || '(unnamed lab)'}</div>
                <div className="text-xs text-gray-500 truncate dark:text-neutral-400">
                  {lab.container_image_display_name || lab.container_image || 'container'} • {lab.resource_tier || 'tier'} • {lab.session_ttl_minutes || 30}m
                </div>
              </div>
              <div className="flex items-center gap-2">
                {lab.custom_lab && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-cp-panel-alt dark:text-green-400">custom</span>
                )}
                {!lab.custom_lab && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-cp-panel-alt dark:text-blue-400">preset</span>
                )}
                <button
                  onClick={() => launchLab(lab._id)}
                  disabled={launchingId === lab._id}
                  className="inline-flex items-center rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-green-600 dark:hover:bg-green-500"
                >
                  {launchingId === lab._id ? 'Launching…' : 'Launch'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 text-sm rounded border border-red-200 bg-red-50 text-red-800 dark:bg-cp-panel-alt dark:border-cp-border">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Loading your labs…</div>
      ) : labs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-4 dark:bg-cp-panel-alt dark:border-cp-border">
          <LabList title="Custom Labs" items={customLabs} />
          <div className="h-4" />
          <LabList title="Preset Labs" items={presetLabs} />
        </div>
      )}
    </div>
  );
};

export default MyLabs;
