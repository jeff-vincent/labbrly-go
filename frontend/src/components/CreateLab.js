import React, { useState, useEffect, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { jwtDecode } from 'jwt-decode';
import NewLab from './NewLab';
import CreateStockLab from './CreateStockLab';
import CreateCustomLab from './CreateCustomLab';

const CreateLab = () => {
  const { getAccessTokenSilently } = useAuth0();
  const [jwt, setJwt] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [orgData, setOrgData] = useState(null);
  const [createdLabId, setCreatedLabId] = useState(null);
  const [showNewLabModal, setShowNewLabModal] = useState(false);

  useEffect(() => {
    const fetchOrgId = async () => {
      try {
        const token = await getAccessTokenSilently({ audience: 'urn:labthingy:api' });
        setJwt(token);
        const decoded = jwtDecode(token);
        setOrgId(decoded['org_id']);
      } catch (error) {
        console.error('Failed to fetch organization ID:', error);
      }
    };
    fetchOrgId();
  }, [getAccessTokenSilently]);

  useEffect(() => {
    if (!orgId || !jwt) return;
    const fetchOrgData = async () => {
      try {
        const response = await fetch(`/orgs/org`, { headers: { Authorization: `Bearer ${jwt}` } });
        if (response.ok) {
          const data = await response.json();
          setOrgData(data);
        } else {
          console.error('Failed to fetch organization data:', response.statusText);
        }
      } catch (error) {
        console.error('Error fetching organization data:', error);
      }
    };
    fetchOrgData();
  }, [orgId, jwt]);

  const presetEnvironments = useMemo(() => ([
    { id: 'python', label: 'Python', containerImage: 'registry.digitalocean.com/labthingy/lab-thingy-python:latest', scriptName: 'main.py', executionCommand: 'python' },
    { id: 'nodejs', label: 'Node.js', containerImage: 'registry.digitalocean.com/labthingy/lab-thingy-nodejs:latest', scriptName: 'app.js', executionCommand: 'node' },
    { id: 'golang', label: 'Golang', containerImage: 'registry.digitalocean.com/labthingy/lab-thingy-golang:latest', scriptName: 'main.go', executionCommand: 'go run' },
  ]), []);

  const isFreeAccount = orgData?.account_type === 'free';

  const handleCreated = (labId) => {
    setCreatedLabId(labId);
    setShowNewLabModal(true);
  };

  const handleCloseNewLabModal = () => {
    setShowNewLabModal(false);
    setCreatedLabId(null);
  };

  return (
    <div className="space-y-6">
  {/* Stock section on top */}
  <CreateStockLab
        jwt={jwt}
        orgId={orgId}
        presetEnvironments={presetEnvironments}
        onCreated={handleCreated}
      />

      {/* Custom section below (always render; premium features inside may be disabled for free accounts) */}
      <CreateCustomLab
        jwt={jwt}
        orgId={orgId}
        orgData={orgData}
        presetEnvironments={presetEnvironments}
        isFreeAccount={isFreeAccount}
        onCreated={handleCreated}
      />

      {showNewLabModal && (
        <NewLab labID={createdLabId} isOpen={showNewLabModal} onClose={handleCloseNewLabModal} />
      )}
    </div>
  );
};

export default CreateLab;