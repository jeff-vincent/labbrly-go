import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

const DeleteLab = () => {
  const [labs, setLabs] = useState([]);
  const [selectedLabId, setSelectedLabId] = useState('');
  const [selectedLab, setSelectedLab] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jwt, setJwt] = useState(null);
  const [presetEnvironment, setPresetEnvironment] = useState('');

  const presetEnvironments = [
    {
      id: 'python',
      label: 'Python',
      containerImage: 'jdvincent/lab-thingy-stock-python-env:latest',
      scriptName: 'script.py',
      executionCommand: 'python'
    },
    {
      id: 'nodejs',
      label: 'Node.js',
      containerImage: 'jdvincent/lab-thingy-stock-node-env:latest',
      scriptName: 'app.js',
      executionCommand: 'node'
    },
    {
      id: 'golang',
      label: 'Golang',
      containerImage: 'jdvincent/lab-thingy-stock-go-env:latest',
      scriptName: 'main.go',
      executionCommand: 'go run'
    }
  ];

  const { getAccessTokenSilently } = useAuth0();

  useEffect(() => {
    const fetchJwt = async () => {
      try {
        const token = await getAccessTokenSilently({
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        });
        setJwt(token);
      } catch (error) {
        console.error('Error fetching JWT:', error);
      }
    };
    fetchJwt();
  }, [getAccessTokenSilently]);

  useEffect(() => {
    const fetchLabs = async () => {
      if (!jwt) return;
      
      try {
        const response = await fetch(`/labs`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`,
          },
        });
        const labsData = await response.json();
        setLabs(labsData);
      } catch (error) {
        console.error('Error fetching labs:', error);
      }
    };

    fetchLabs();
  }, [jwt]);

  const handleLabSelectChange = (event) => {
    const selectedId = event.target.value;
    setSelectedLabId(selectedId);
    setShowConfirmation(false);

    if (selectedId) {
      const lab = labs.find(lab => lab._id === selectedId);
      setSelectedLab(lab);
    } else {
      setSelectedLab(null);
    }
  };

  const handleDeleteClick = () => {
    if (selectedLabId) {
      setShowConfirmation(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedLabId) return;
    
    setLoading(true);

    try {
      const response = await fetch(`/labs/lab/${selectedLabId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
      });

      if (response.ok) {
        console.log('Lab deleted successfully');
        // Remove the deleted lab from the list
        setLabs(prev => prev.filter(lab => lab._id !== selectedLabId));
        // Reset state
        setSelectedLabId('');
        setSelectedLab(null);
        setShowConfirmation(false);
      } else {
        throw new Error('Failed to delete lab.');
      }
    } catch (error) {
      console.error('Error deleting lab:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDelete = () => {
    setShowConfirmation(false);
  };

  const handlePresetEnvironmentChange = (event) => {
    const selectedPreset = event.target.value;
    setPresetEnvironment(selectedPreset);

    if (selectedPreset && selectedLab) {
      const preset = presetEnvironments.find(env => env.id === selectedPreset);
      if (preset) {
        // Update the selected lab with preset values
        setSelectedLab(prev => ({
          ...prev,
          container_image: preset.containerImage,
          script_name: preset.scriptName,
          execution_command: preset.executionCommand
        }));
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="labDropdown" className="block text-sm font-medium text-gray-700 dark:text-neutral-300">
          Select a Lab to Delete
        </label>
        <select
          id="labDropdown"
          onChange={handleLabSelectChange}
          value={selectedLabId}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
        >
          <option value="">Select a lab to delete</option>
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

      {selectedLab && !showConfirmation && (
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Lab Details</h3>
          <div className="space-y-2">
            <div>
              <span className="text-sm font-medium text-gray-600">Name: </span>
              <span className="text-sm text-gray-900">{selectedLab.name}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600">Container Image: </span>
              <span className="text-sm text-gray-900 font-mono">{selectedLab.container_image || 'Not specified'}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600">Components: </span>
              <span className="text-sm text-gray-900">
                {selectedLab.elements && selectedLab.elements.length > 0 
                  ? selectedLab.elements.join(', ') 
                  : 'None specified'}
              </span>
            </div>
          </div>
          
          <button 
            onClick={handleDeleteClick}
            className="mt-6 w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center"
          >
            Delete Lab
          </button>
        </div>
      )}

      {showConfirmation && selectedLab && (
        <div className="bg-red-50 border border-red-200 p-6 rounded-lg">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-red-800 mb-2">Confirm Deletion</h3>
              <p className="text-sm text-red-700 mb-4">
                Are you sure you want to delete the lab "<strong>{selectedLab.name}</strong>"? 
                This action cannot be undone and will permanently remove all associated data including videos, code examples, and lab content.
              </p>
              
              <div className="flex space-x-3">
                <button 
                  onClick={handleConfirmDelete}
                  disabled={loading}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Deleting...
                    </>
                  ) : (
                    'Yes, Delete Lab'
                  )}
                </button>
                
                <button 
                  onClick={handleCancelDelete}
                  disabled={loading}
                  className="bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 disabled:cursor-not-allowed text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {labs.length === 0 && jwt && (
        <div className="text-center py-8">
          <p className="text-gray-500">No labs available to delete.</p>
        </div>
      )}
    </div>
  );
};

export default DeleteLab;
