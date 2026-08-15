import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth0 } from '@auth0/auth0-react';

const POLL_MS = 2000;

const ImageBuildStatus = ({ job_name, onClose, imageName }) => {
  const { getAccessTokenSilently } = useAuth0();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const finishedRef = useRef(false);
  const reportedRef = useRef(false);

  const finished = status
    ? (status.succeeded && status.succeeded > 0) || (status.failed && status.failed > 0)
    : false;

  useEffect(() => {
    if (!job_name) return;

    let abort = new AbortController();
    let mounted = true;

    const fetchStatus = async () => {
      try {
        setLoading(prev => (status ? prev : true));
        const token = await getAccessTokenSilently({ audience: process.env.REACT_APP_AUTH0_AUDIENCE });
        const res = await fetch(`/builder/status/${encodeURIComponent(job_name)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abort.signal,
        });
        if (!res.ok) {
          throw new Error(`${res.status}`);
        }
        const data = await res.json();
        if (!mounted) return;
        setStatus(data);
        setError('');
        setLoading(false);
        if ((data.succeeded > 0 || data.failed > 0) && !finishedRef.current) {
          finishedRef.current = true;
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      } catch (e) {
        if (abort.signal.aborted) return;
        if (!mounted) return;
        setError('Unable to fetch status');
        setLoading(false);
        // Stop further polling if job not found (404) or repeated errors
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    // Initial fetch
    fetchStatus();
    // Start interval
    timerRef.current = setInterval(fetchStatus, POLL_MS);

    return () => {
      mounted = false;
      abort.abort();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [job_name, getAccessTokenSilently]);

  // Report successful build once (now fetch existing images and send full list)
  useEffect(() => {
    if (!status) return;
    if (status.succeeded > 0 && !reportedRef.current) {
      reportedRef.current = true;
      (async () => {
        try {
          const token = await getAccessTokenSilently({ audience: process.env.REACT_APP_AUTH0_AUDIENCE });

          await fetch('/orgs/image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ image_name: imageName }),
          });
        } catch (e) {
          console.warn('Failed to update org images list', e);
        }
      })();
    }
  }, [status, imageName, job_name, getAccessTokenSilently]);

  if (!job_name) return null;

  const stateLabel = () => {
    if (error) return 'Error';
    if (loading && !status) return 'Loading...';
    if (!status) return 'Pending';
    if (status.succeeded > 0) return 'Succeeded';
    if (status.failed > 0) return 'Failed';
    if (status.active > 0) return 'Running';
    return 'Queued';
  };

  const close = () => {
    if (onClose) onClose();
  };

  const modal = (
    <div
      aria-modal="true"
      role="dialog"
      aria-labelledby="image-build-status-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={close} />
  <div className="relative w-full max-w-md rounded-lg bg-white shadow-xl border border-gray-200 p-5 dark:bg-cp-panel dark:border-cp-border dark:shadow-cp">
  <h2 id="image-build-status-title" className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
          Image Build Status
        </h2>
        <p className="mt-1 text-xs text-gray-500 break-all">Job: {job_name}</p>

        <div className="mt-4 flex items-center gap-2">
          {!finished && !error && (
            <div className="animate-spin h-5 w-5 rounded-full border-2 border-green-600 border-t-transparent" />
          )}
          <span
            className={`text-sm font-medium ${
              stateLabel() === 'Succeeded'
                ? 'text-green-600'
                : stateLabel() === 'Failed'
                ? 'text-red-600'
                : stateLabel() === 'Error'
                ? 'text-red-600'
                : 'text-green-600'
            }`}
          >
            {stateLabel()}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md border p-2">
            <div className="text-xs text-gray-500">Active</div>
            <div className="text-base font-semibold text-gray-800">{status?.active ?? '-'}</div>
          </div>
            <div className="rounded-md border p-2">
            <div className="text-xs text-gray-500">Succeeded</div>
            <div className="text-base font-semibold text-green-600">{status?.succeeded ?? '-'}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-xs text-gray-500">Failed</div>
            <div className="text-base font-semibold text-red-600">{status?.failed ?? '-'}</div>
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600">
            {error}
          </p>
        )}

        {finished && (
          <p className="mt-4 text-sm text-gray-600">
            Build has {status?.succeeded > 0 ? 'completed successfully.' : 'failed.'}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          {finished && (
            <button
              type="button"
              onClick={() => {
                // Allow consumer to refresh list etc.
                close();
              }}
              className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:ring-offset-1"
            >
              Close
            </button>
          )}
          {!finished && (
            <button
              type="button"
              onClick={close}
              className="inline-flex items-center rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:ring-offset-1"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default ImageBuildStatus;
