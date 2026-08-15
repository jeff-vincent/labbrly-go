import React, { useEffect, useMemo, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { jwtDecode } from 'jwt-decode';
import NewLab from './NewLab';
import EditStockLab from './EditStockLab';
import EditCustomLab from './EditCustomLab';

const EditLab = () => {
  const { getAccessTokenSilently } = useAuth0();
  const [jwt, setJwt] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [orgData, setOrgData] = useState(null);
  const [labs, setLabs] = useState([]);
  const [selectedLabId, setSelectedLabId] = useState('');
  const [showNewLabModal, setShowNewLabModal] = useState(false);
  const [savedLabId, setSavedLabId] = useState(null);

  useEffect(() => {
    const fetchJwtAndOrgId = async () => {
      try {
        const token = await getAccessTokenSilently({ audience: process.env.REACT_APP_AUTH0_AUDIENCE });
        setJwt(token);
        const decoded = jwtDecode(token);
        setOrgId(decoded['org_id']);
      } catch (error) {
        console.error('Error fetching JWT:', error);
      }
    };
    fetchJwtAndOrgId();
  }, [getAccessTokenSilently]);

  useEffect(() => {
    if (!orgId || !jwt) return;
    const fetchOrgData = async () => {
      try {
        const response = await fetch(`/orgs/org`, { headers: { Authorization: `Bearer ${jwt}` } });
        if (response.ok) {
          setOrgData(await response.json());
        }
      } catch (err) {
        console.error('Failed to fetch organization data:', err);
      }
    };
    fetchOrgData();
  }, [orgId, jwt]);

  useEffect(() => {
    if (!jwt) return;
    const fetchLabs = async () => {
      try {
        const response = await fetch(`/labs`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` } });
        const labsData = await response.json();
        setLabs(labsData || []);
      } catch (error) {
        console.error('Error fetching labs:', error);
      }
    };
    fetchLabs();
  }, [jwt]);

  const isFreeAccount = orgData?.account_type === 'free';
  const selectedLab = useMemo(() => labs.find((l) => l._id === selectedLabId) || null, [labs, selectedLabId]);

  const handleSaved = (labId) => {
    setSavedLabId(labId);
    setShowNewLabModal(true);
  };

  const handleCloseNewLabModal = () => {
    setShowNewLabModal(false);
    setSavedLabId(null);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="labDropdown" className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Select a Lab to Edit</label>
        <select
          id="labDropdown"
          onChange={(e) => setSelectedLabId(e.target.value)}
          value={selectedLabId}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
        >
          <option value="">Select a lab to edit</option>
          {(() => {
            const customLabs = labs.filter((l) => !!l.custom_lab);
            const presetLabs = labs.filter((l) => !l.custom_lab);
            return (
              <>
                {customLabs.length > 0 && (
                  <optgroup label="Custom Labs">
                    {customLabs.map((lab) => (
                      <option key={lab._id} value={lab._id}>
                        {lab.name} [custom]
                      </option>
                    ))}
                  </optgroup>
                )}
                {presetLabs.length > 0 && (
                  <optgroup label="Preset Labs">
                    {presetLabs.map((lab) => (
                      <option key={lab._id} value={lab._id}>
                        {lab.name} [preset]
                      </option>
                    ))}
                  </optgroup>
                )}
              </>
            );
          })()}
        </select>
      </div>

      {selectedLab && (
        selectedLab.custom_lab ? (
          <EditCustomLab
            jwt={jwt}
            orgId={orgId}
            orgData={orgData}
            selectedLab={selectedLab}
            isFreeAccount={isFreeAccount}
            onSaved={handleSaved}
          />
        ) : (
          <EditStockLab
            jwt={jwt}
            orgId={orgId}
            selectedLab={selectedLab}
            isFreeAccount={isFreeAccount}
            onSaved={handleSaved}
          />
        )
      )}

      {showNewLabModal && (
        <NewLab labID={savedLabId} isOpen={showNewLabModal} onClose={handleCloseNewLabModal} />
      )}
    </div>
  );
};

export default EditLab;
