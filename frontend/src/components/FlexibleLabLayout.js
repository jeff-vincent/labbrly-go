import React, { useEffect, useState } from 'react';
import VideoPlayer from './Video';
import IDE from './IDE';
import LabText from './LabText';
import Terminal from './Terminal';
import SubmitLab from './SubmitLab';
import Copilot from './Copilot';
import LabSessionAnalyzer from './LabSessionAnalyzer';

const LabLayout = () => {
  const [labData, setLabData] = useState(null);
  const [labID, setLabID] = useState(null);
  const [copilotVisible, setCopilotVisible] = useState(true); // new: controls Copilot sidebar
  const [showFloatingVideo, setShowFloatingVideo] = useState(false); // screen-in-screen video overlay

  // Send "lab started" event to orgs service
  const notifyLabStarted = async (jwt, labID) => {
    try {
      await fetch('/analytics/event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({ 
          event: 'lab started', 
          lab_id: labID,
        }),
      });
    } catch (e) {
      console.error('Failed to notify lab started:', e);
    }
  };

  useEffect(() => {
    console.log('LabLayout: useEffect triggered');
    
    const fetchLabConfig = async () => {
      try {
        console.log('LabLayout: Starting fetchLabConfig');
        const jwt = localStorage.getItem('jwt');
        console.log('LabLayout: JWT retrieved:', jwt ? 'Present' : 'Missing');
        
        const response = await fetch(`/labs/lab`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`
          },
        });

        console.log('LabLayout: API response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const labContent = await response.json();
        console.log('LabLayout: Lab content received:', labContent);
        console.log('LabLayout: Lab elements:', labContent.elements);
        
        // Set IDs first so we can pass a stable value to notify
        setLabID(labContent._id);
        setLabData(labContent);

        // Start compute environment with the fetched lab content
        await startComputeEnv(
          labContent.container_image, 
          labContent.resource_tier, 
          labContent.session_ttl_minutes);

        // Now that we have a known lab ID, notify
        await notifyLabStarted(jwt, labContent._id);

        console.log('LabLayout: State updated - labID:', labContent._id);
      } catch (error) {
        console.error('LabLayout: Failed to fetch lab configuration:', error);
      }
    };

    const startComputeEnv = async (containerImage = null, resourceTier = null, sessionTTL = null) => {
      const payload = { 
        container_image: containerImage,
        session_ttl_minutes: sessionTTL,
        resource_tier: resourceTier
      };
      try {
        const jwt = localStorage.getItem('jwt');
        const response = await fetch(`/compute/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        console.log('Compute env started:', data);
        // notify moved to after labID is set in fetchLabConfig
      } catch (error) {
        console.error('Failed to start compute environment:', error);
      }
    };

    fetchLabConfig();
  }, []);

  const renderComponent = (componentType, index = 0, total = 1) => {
    console.log('LabLayout: Rendering component type:', componentType);
    console.log('LabLayout: labData available:', !!labData);
    
    switch (componentType) {
      case 'IDE':
        console.log('LabLayout: Rendering IDE with labData:', labData);
        return <IDE labData={labData} />;
  case 'LabText':
        console.log('LabLayout: Rendering LabText with lab_text:', labData?.lab_text);
        // Tune max height based on layout to reduce empty space in other cards
        // 1 item: taller; 2 items: a bit shorter; 3-4 items: balanced
        const labTextMaxH = total === 1
          ? 'max-h-[80vh]'
          : total === 2
            ? 'max-h-[70vh] md:max-h-[60vh]'
            : 'max-h-[65vh] md:max-h-[60vh]';
        return (
          <div className={`min-h-0 ${labTextMaxH} overflow-y-auto`}>
            <LabText
              labText={labData.lab_text}
              headerActions={hasVideo ? (
                <button
                  type="button"
                  onClick={() => setShowFloatingVideo(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 transition-colors dark:border-cp-border dark:text-cp-blue dark:bg-cp-panel-alt dark:hover:bg-cp-panel"
                  title="Open video"
                  aria-label="Open video"
                >
                  {/* play icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M8 5v14l11-7L8 5z" />
                  </svg>
                  Watch video
                </button>
              ) : null}
            />
          </div>
        );
      case 'Terminal':
        console.log('LabLayout: Rendering Terminal with terminal_commands:', labData?.terminal_commands);
        return <Terminal terminalText={labData.terminal_commands} />;
      case 'Video':
        console.log('LabLayout: Rendering VideoPlayer with labID:', labID);
        return <VideoPlayer labID={labID} />;
      case 'Copilot':
        console.log('LabLayout: Rendering Copilot with labID:', labID);
        return <Copilot labID={labID} />;
      case 'LabSessionAnalyzer':
  console.log('LabLayout: Rendering LabSessionAnalyzer with labId:', labID);
  return (
    <LabSessionAnalyzer
      labId={labID}
      consoleOnly={false}
      flushIntervalMs={15000}
    />
  );
      default:
        console.warn('LabLayout: Unknown component type:', componentType);
        return null;
    }
  };

  const getGridClasses = (componentCount) => {
    // Responsive: stack on small screens; grid from md and up
    if (componentCount >= 5) {
      // For 5+ items, use two columns and let rows auto-flow
      return 'grid-cols-1 md:grid-cols-2';
    }
    switch (componentCount) {
      case 2:
        return 'grid-cols-1 md:grid-cols-2 md:grid-rows-1';
      case 3:
        return 'grid-cols-1 md:grid-cols-2 md:grid-rows-2';
      case 4:
        return 'grid-cols-1 md:grid-cols-2 md:grid-rows-2';
      default:
        return 'grid-cols-1';
    }
  };

  const getComponentClasses = (index, total) => {
    if (total === 3) {
      // For 3 components at md+ breakpoint:
      // - First fills full left column (spans two rows)
      // - Remaining two are stacked in the right column
      if (index === 0) return 'col-span-1 md:row-span-2 md:col-start-1';
      if (index === 1) return 'col-span-1 md:row-span-1 md:col-start-2 md:row-start-1';
      return 'col-span-1 md:row-span-1 md:col-start-2 md:row-start-2';
    }
    // Default: each item takes one grid cell; stacks on small screens
    return 'col-span-1';
  };

  console.log('LabLayout: Render check - labData:', !!labData, 'labID:', !!labID);
  
  if (!labData || !labID) {
    console.log('LabLayout: Showing loading state');
    return (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center dark:bg-cp-bg">
        <div>Loading lab configuration...</div>
      </div>
    );
  }

  // Build a consistently ordered components array based on rules:
  // - If Video exists, it is always first
  // - If no Video but LabText exists, LabText is first
  // - With all four: Video, Terminal, LabText, IDE
  // - If only Terminal and IDE, Terminal is first
  const rawElements = Array.isArray(labData.elements) ? labData.elements.filter(Boolean) : [];
  const uniqueElements = Array.from(new Set(rawElements)); // de-dupe while preserving original order

  const hasVideo = uniqueElements.includes('Video');
  const hasLabText = uniqueElements.includes('LabText');

  let ordered = [];

  if (hasVideo && hasLabText) {
    // When both Video and LabText are present, do not render a separate Video card
    // We'll provide a CTA in the LabText header that opens a floating overlay.
    ['LabText', 'Terminal', 'IDE'].forEach(t => {
      if (uniqueElements.includes(t)) ordered.push(t);
    });
  } else if (hasVideo && !hasLabText) {
    // If there's a video but no LabText, render the Video card normally
    ordered.push('Video');
    ['Terminal', 'IDE'].forEach(t => {
      if (uniqueElements.includes(t)) ordered.push(t);
    });
  } else if (hasLabText) {
    ordered.push('LabText');
    ['Terminal', 'IDE'].forEach(t => {
      if (uniqueElements.includes(t)) ordered.push(t);
    });
  } else {
    ['Terminal', 'IDE'].forEach(t => {
      if (uniqueElements.includes(t)) ordered.push(t);
    });
  }

  // Append any unknown component types in their original order
  uniqueElements.forEach(t => {
    if (!ordered.includes(t)) ordered.push(t);
  });

  const components = ordered;
  console.log('LabLayout: Components to render:', components);
  console.log('LabLayout: Components length:', components.length);
  console.log('LabLayout: Includes LabSessionAnalyzer?', components.includes('LabSessionAnalyzer'));

  // New: split Copilot out to a right-hand sidebar
  const hasCopilot = components.includes('Copilot');
  const mainComponents = components.filter((c) => c !== 'Copilot');
  const gridCount = mainComponents.length; // count used for grid rules (ignores Copilot)
  console.log('LabLayout: Main components (no Copilot):', mainComponents, 'gridCount:', gridCount);

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 dark:bg-cp-bg">
      <div className="max-w-7xl mx-auto">
        <div className="space-y-6 min-h-[calc(100vh-3rem)]">
          {/* Main content + optional Copilot sidebar */}
          <div className="w-full md:flex md:items-start md:gap-6">
            {/* Main column: unchanged grid rules, applied to mainComponents */}
            <div className={hasCopilot && copilotVisible ? 'w-full md:flex-1' : 'w-full'}>
              {/* Special layout: If both IDE and Terminal are present, render Video/LabText above, then IDE card spanning two columns with Terminal embedded inside. */}
        {mainComponents.includes('IDE') && mainComponents.includes('Terminal') ? (
                <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
                  {/* Top row: If only Video (no LabText), show Video card; otherwise LabText with CTA when Video exists */}
                  {hasVideo && !hasLabText && (
                    <div className="col-span-1 md:col-span-2 min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp">
                      <div className="h-full min-h-0 p-4">
                        {renderComponent('Video', 0, 1)}
                      </div>
                    </div>
                  )}
                  {hasLabText && (
                    <div className={`col-span-1 md:col-span-2 min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp`}>
                      <div className="h-full min-h-0 p-4">
                        {renderComponent('LabText', 0, 1)}
                      </div>
                    </div>
                  )}

                  {/* IDE: spans two columns with embedded Terminal below editor area */}
                  <div className="col-span-1 md:col-span-2 min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp">
                    <div className="h-full min-h-0 p-4">
                      {/* Render IDE with embedded Terminal */}
                      <IDE labData={labData} showEmbeddedTerminal={true} embeddedTerminalText={labData.terminal_commands} />
                    </div>
                  </div>

                  {/* Render any remaining components (excluding Video, LabText, Terminal, IDE) below */}
                  {mainComponents.filter(c => !['Video', 'LabText', 'Terminal', 'IDE'].includes(c)).map((componentType, index) => {
                    const isAnalyzer = componentType === 'LabSessionAnalyzer';
                    return (
                      <div
                        key={`${componentType}-rest-${index}`}
                        className={
                          isAnalyzer
                            ? 'col-span-1 min-h-0'
                            : 'col-span-1 min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp'
                        }
                      >
                        <div className={isAnalyzer ? '' : 'h-full min-h-0 p-4'}>
                          {renderComponent(componentType, index, 1)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : mainComponents.includes('IDE') && !mainComponents.includes('Terminal') ? (
                // New: When IDE is present without Terminal, keep the same layout — Video | LabText on top row (if both), IDE spans full width below
                <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
                  {/* Top row: If only Video (no LabText), show Video card; otherwise LabText; if Video exists, use CTA to open overlay */}
                  {hasVideo && !hasLabText && (
                    <div className="col-span-1 md:col-span-2 min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp">
                      <div className="h-full min-h-0 p-4">
                        {renderComponent('Video', 0, 1)}
                      </div>
                    </div>
                  )}
                  {hasLabText && (
                    <div className={`col-span-1 md:col-span-2 min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp`}>
                      <div className="h-full min-h-0 p-4">
                        {renderComponent('LabText', 0, 1)}
                      </div>
                    </div>
                  )}

                  {/* IDE: spans two columns (no embedded terminal since Terminal not selected) */}
                  <div className="col-span-1 md:col-span-2 min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp">
                    <div className="h-full min-h-0 p-4">
                      <IDE labData={labData} />
                    </div>
                  </div>

                  {/* Any remaining components (excluding Video, LabText, IDE) */}
                  {mainComponents.filter(c => !['Video', 'LabText', 'IDE'].includes(c)).map((componentType, index) => {
                    const isAnalyzer = componentType === 'LabSessionAnalyzer';
                    return (
                      <div
                        key={`${componentType}-rest2-${index}`}
                        className={
                          isAnalyzer
                            ? 'col-span-1 min-h-0'
                            : 'col-span-1 min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp'
                        }
                      >
                        <div className={isAnalyzer ? '' : 'h-full min-h-0 p-4'}>
                          {renderComponent(componentType, index, 1)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : gridCount === 1 ? (
                // Preserve special-case for analyzer (no card styling)
                mainComponents[0] === 'LabSessionAnalyzer' ? (
                  <div className="min-h-0">
                    {renderComponent(mainComponents[0], 0, gridCount)}
                  </div>
                ) : (
                  <div className="min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp">
                    <div className="h-full min-h-0 p-4">
                      {renderComponent(mainComponents[0], 0, gridCount)}
                    </div>
                  </div>
                )
              ) : gridCount === 2 ? (
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  {mainComponents.map((componentType, index) => (
                    <div
                      key={`${componentType}-${index}`}
                      className="w-full md:w-1/2 min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp"
                    >
                      <div className="h-full min-h-0 p-4">
                        {renderComponent(componentType, index, gridCount)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`grid gap-6 ${getGridClasses(gridCount)}`}>
                  {mainComponents.map((componentType, index) => {
                    console.log(`LabLayout: Mapping component ${index}:`, componentType);
                    const isAnalyzer = componentType === 'LabSessionAnalyzer';
                    return (
                      <div
                        key={`${componentType}-${index}`}
                        className={
                          isAnalyzer
                            ? `${getComponentClasses(index, gridCount)} min-h-0`
                            : `${getComponentClasses(index, gridCount)} min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp`
                        }
                      >
                        <div className={isAnalyzer ? '' : 'h-full min-h-0 p-4'}>
                          {renderComponent(componentType, index, gridCount)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Scored Lab: render at the bottom of main column; spans all columns except sidebar */}
              {labData.scored_lab && (
                <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp" style={{ height: '120px' }}>
                  <div className="h-full p-4">
                    <SubmitLab />
                  </div>
                </div>
              )}

              {/* Floating Video Overlay (screen-in-screen) */}
              {hasVideo && showFloatingVideo && (
                <div className="fixed inset-0 z-50 pointer-events-none">
                  {/* Backdrop (click to close) */}
                  <div
                    className="absolute inset-0 bg-black/10 dark:bg-black/30 pointer-events-auto"
                    onClick={() => setShowFloatingVideo(false)}
                    aria-label="Close video"
                  />
                  {/* Draggable-ish corner card */}
                  <div className="absolute bottom-6 right-6 w-[min(90vw,420px)] pointer-events-auto">
                    <div className="bg-white/95 backdrop-blur rounded-lg shadow-xl border border-gray-200 overflow-hidden dark:bg-cp-panel/95 dark:border-cp-border">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-cp-border">
                        <div className="text-sm font-medium text-gray-700 dark:text-neutral-200 flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                          Video
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-cp-panel-alt"
                            title="Pop out"
                            aria-label="Pop out"
                            onClick={() => {
                              // Try to open native PiP if supported
                              const videoEl = document.querySelector('#floating-video video');
                              if (videoEl && document.pictureInPictureEnabled && !videoEl.disablePictureInPicture) {
                                videoEl.requestPictureInPicture?.().catch(() => setShowFloatingVideo(false));
                              } else {
                                setShowFloatingVideo(false);
                              }
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-600 dark:text-neutral-300">
                              <path d="M13 7h6a2 2 0 012 2v6h-8V7z" />
                              <path d="M3 5a2 2 0 012-2h8v2H5v14h14v-8h2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
                            </svg>
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-cp-panel-alt"
                            title="Close"
                            aria-label="Close"
                            onClick={() => setShowFloatingVideo(false)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-600 dark:text-neutral-300">
                              <path fillRule="evenodd" d="M6.225 4.811a1 1 0 011.414 0L12 9.172l4.361-4.361a1 1 0 111.414 1.414L13.414 10.586l4.361 4.361a1 1 0 01-1.414 1.414L12 12l-4.361 4.361a1 1 0 01-1.414-1.414l4.361-4.361-4.361-4.361a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div id="floating-video" className="p-3">
                        <VideoPlayer labID={labID} containerless={true} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Copilot sidebar on the far right (md+) */}
            {hasCopilot && (
              <aside
                className={`hidden md:flex flex-col transition-all duration-200 ease-in-out ${
                  copilotVisible ? 'w-[320px]' : 'w-6'
                }`}
              >
                {/* Toggle control */}
                {copilotVisible ? (
                  <div className="mb-0 h-full min-h-0 flex flex-col">
                    <div className="h-full min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-cp-panel dark:border-cp-border dark:shadow-cp">
                      <Copilot containerless={true} onHide={() => setCopilotVisible(false)} />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCopilotVisible(true)}
                    className="h-10 mt-1 w-6 rounded bg-white shadow-sm border border-gray-200 flex items-center justify-center rotate-180 dark:bg-cp-panel dark:border-cp-border"
                    aria-label="Expand Lab Assistant"
                    title="Show Lab Assistant"
                  >
                    ▸
                  </button>
                )}
              </aside>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LabLayout;
