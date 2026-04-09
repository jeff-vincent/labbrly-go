import React, { useState } from 'react';

const SubmitLab = () => {
  // Hoisted helper so it can be used before definition
  function getLabIdFromJWT(jwt) {
    if (!jwt) return null;
    try {
      const base64Url = jwt.split('.')[1];
      if (!base64Url) return null;
      // Handle URL-safe base64 and padding
      let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4;
      if (pad) base64 += '='.repeat(4 - pad);
      const payload = JSON.parse(atob(base64));
      return payload?.lab_id || null;
    } catch (e) {
      console.error('Failed to parse JWT:', e);
      return null;
    }
  }

  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const labID = getLabIdFromJWT(localStorage.getItem('jwt'));

  // Send completion event to orgs service
  const notifyCompletion = async (jwt) => {
    try {
      await fetch('/analytics/event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({ 
          event: 'lab completed',
          lab_id: labID
         }),
      });
    } catch (e) {
      console.error('Failed to notify completion:', e);
    }
  };

  const handleSubmitLab = async () => {
    setIsLoading(true);
    try {
      const jwt = localStorage.getItem('jwt');
      const response = await fetch('/compute/check-lab', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`
        },
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Lab check response:', data);
      console.log('Setting modalData to:', data);
      console.log('Setting showModal to: true');
      if (data?.status === 'success') {
        await notifyCompletion(jwt);
      }
      setModalData(data);
      setShowModal(true);
    } catch (error) {
      console.error('Failed to check lab:', error);
      setModalData({ 
        status: 'error', 
        message: 'Failed to connect to the lab checker. Please try again.',
        output: error.message 
      });
      setShowModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setModalData(null);
  };

  return (
    <>
      <div className="flex justify-between items-center h-full px-4">
        <div className="text-gray-700">
          <p className="text-sm font-medium">Ready to submit your lab?</p>
          <p className="text-xs text-gray-500 mt-1">Click submit to run the validation checks</p>
        </div>
        <button
          onClick={handleSubmitLab}
          disabled={isLoading}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-6 rounded-md shadow-sm transition-colors duration-200"
        >
          {isLoading ? 'Checking...' : 'Submit Lab'}
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          {console.log('Modal rendering with modalData:', modalData)}
          {console.log('modalData?.status:', modalData?.status)}
          {console.log('Status check result:', modalData?.status === 'success')}
          <div className="bg-white rounded-lg max-w-md w-full mx-4 p-6 shadow-xl">
            {modalData?.status === 'success' ? (
              // Success Modal
              <>
                <div className="text-center mb-4">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                    <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">🎉 Congratulations!</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Excellent work! You've successfully completed the lab. All validation checks have passed.
                  </p>
                </div>
                {modalData.output && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-4">
                    <pre className="text-xs text-green-800 whitespace-pre-wrap">{modalData.output}</pre>
                  </div>
                )}
              </>
            ) : (
              // Error Modal
              <>
                <div className="text-center mb-4">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 mb-4">
                    <svg className="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Keep Going! 💪</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    The lab isn't quite complete yet, but you're on the right track! Review the feedback below and try again.
                  </p>
                </div>
                {modalData?.output && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
                    <pre className="text-xs text-yellow-800 whitespace-pre-wrap">{modalData.output}</pre>
                  </div>
                )}
                <p className="text-xs text-gray-500 text-center">
                  Don't give up! Every expert was once a beginner.
                </p>
              </>
            )}
            
            <div className="mt-6">
              <button
                onClick={closeModal}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SubmitLab;
