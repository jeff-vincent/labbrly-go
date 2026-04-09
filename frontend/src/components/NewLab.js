import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

const NewLab = ({ labID, isOpen, onClose }) => {
  const { getAccessTokenSilently } = useAuth0();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [labToken, setLabToken] = useState(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    console.log('Starting lab token generation for labID:', labID);

    try {
      // Get Auth0 token
      console.log('Getting Auth0 access token...');
      const token = await getAccessTokenSilently();
      console.log('Auth0 token obtained:', token ? 'Token received' : 'No token');

      // Call /orgs/org endpoint
      console.log('Calling /orgs/org endpoint...');
      const orgResponse = await fetch('/orgs/org', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Org response status:', orgResponse.status);
      if (!orgResponse.ok) {
        throw new Error('Failed to fetch organization data');
      }

      const orgData = await orgResponse.json();
      console.log('Org data received:', orgData);
      const apiKey = orgData.api_keys[0];
      console.log('API key extracted:', apiKey ? 'API key found' : 'No API key');

      // Call /auth/token endpoint
      console.log('Calling /auth/token endpoint with payload:', { labID, api_key: apiKey });
      const tokenResponse = await fetch('/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lab_id: labID,
          api_key: apiKey
        })
      });

      console.log('Token response status:', tokenResponse.status);
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token response error:', errorText);
        throw new Error('Failed to authenticate with lab');
      }

      const tokenData = await tokenResponse.json();
      console.log('Token response data:', tokenData);
      
      // Store the token for the link
      if (tokenData.access_token) {
        console.log('Setting lab token:', tokenData.access_token);
        setLabToken(tokenData.access_token);
      } else {
        console.error('No token found in response data');
      }
      
      // Don't close modal automatically - let user see the link
      // onClose();
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 dark:bg-cp-panel dark:border dark:border-cp-border dark:shadow-cp" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b dark:border-cp-border">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-neutral-100">New Lab</h2>
          <button 
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-gray-700 mb-4 dark:text-neutral-300">Lab ID: <span className="font-mono text-sm">{labID}</span></p>
          
          {labToken && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg dark:bg-cp-panel-alt dark:border-cp-border">
              <p className="text-green-800 text-sm mb-2 dark:text-cp-green">Lab created successfully!</p>
              <a 
                href={`https://subnode1.xyz/?token=${labToken}`}
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 dark:bg-cp-blue dark:hover:brightness-110"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Lab Environment
              </a>
            </div>
          )}
          
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-cp-panel-alt dark:border-cp-border">
              <p className="text-red-800 text-sm">Error: {error}</p>
            </div>
          )}
        </div>
        
  <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 dark:bg-cp-panel-alt dark:border-cp-border">
          <button 
            onClick={onClose} 
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 dark:bg-cp-panel-alt dark:text-neutral-300 dark:border-cp-border dark:hover:bg-cp-panel"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 dark:bg-cp-accent dark:text-black dark:hover:brightness-90"
          >
            {loading ? 'Processing...' : 'Get Lab JWT'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewLab;
