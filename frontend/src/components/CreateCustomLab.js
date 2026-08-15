import React, { useMemo, useState } from 'react';
import { ElementSelector, IDESection, LabTextSection, TerminalSection, VideoSection, ResourceSizeSection, TTLSelector, AIElementSection } from './SharedLabSections';

// Custom-tier lab creator: ONLY allows custom images (from org images list); supports scored labs
const CreateCustomLab = ({ jwt, orgId, orgData, presetEnvironments = [], isFreeAccount = false, onCreated }) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [selectedElements, setSelectedElements] = useState([]);
  const [containerImage, setContainerImage] = useState('');
  const [labText, setLabText] = useState('');
  const [exampleCode, setExampleCode] = useState('');
  const [scriptName, setScriptName] = useState('');
  const [executionCommand, setExecutionCommand] = useState('');
  const [terminalCommands, setTerminalCommands] = useState('');
  const [video, setVideo] = useState(null);
  const [scoredLab, setScoredLab] = useState(false);
  const [resourceSize, setResourceSize] = useState('small');
  const [sessionTtlMinutes, setSessionTtlMinutes] = useState(30);
  const [ragUrls, setRagUrls] = useState([]);
  const [targetedActions, setTargetedActions] = useState([]);

  const availableElements = useMemo(() => ([
    { id: 'LabText', label: 'Lab Text', description: 'Rich text content for the lab' },
    { id: 'IDE', label: 'IDE', description: 'Code editor with example code' },
    { id: 'Terminal', label: 'Terminal', description: 'Terminal commands and expected output' },
    { id: 'Video', label: 'Video', description: 'Instructional video content' }
  ]), []);

  const handleElementToggle = (elementId) => {
    setSelectedElements((prev) => {
      const isSelected = prev.includes(elementId);
      return isSelected ? prev.filter((id) => id !== elementId) : [...prev, elementId];
    });
  };

  const imagesList = Array.isArray(orgData?.images) ? orgData.images : [];
  const imagesLoading = orgId && !orgData;

  const isElementSelected = (elementId) => selectedElements.includes(elementId);
  // No restriction on number of components for custom labs

  const hasEnv = !!containerImage.trim();
  const ideSelected = isElementSelected('IDE');
  const ideValid = !ideSelected || (scriptName.trim() && executionCommand.trim());
  const isButtonDisabled = loading || !name.trim() || !hasEnv || !ideValid;

  const handleSubmit = async (event) => {
    event.preventDefault();
    // Validate IDE fields if IDE is selected
    const _ideSelected = isElementSelected('IDE');
    if (_ideSelected && (!scriptName.trim() || !executionCommand.trim())) {
      // Don't submit if IDE fields are missing
      return;
    }
    setLoading(true);

    const orgSuffix = (orgId || '').replace(/^org_/, '').toLowerCase();
    // Matches the image builder's own destination format exactly (see
    // builder/internal/builder/handlers.go: imageTag + cfg.Registry).
    const fullContainerImage = `${process.env.REACT_APP_IMAGE_REGISTRY}/labthingy-org-lab:${containerImage}-${orgSuffix}`;

    const payload = {
      name: name,
      org_id: orgId,
      container_image: fullContainerImage,
      container_image_display_name: containerImage,
      custom_lab: true,
      elements: selectedElements,
      scored_lab: scoredLab,
      resource_tier: resourceSize,
      session_ttl_minutes: isFreeAccount ? 30 : Number(sessionTtlMinutes) || 30,
      lab_text: isElementSelected('LabText') ? labText : '',
      example_code: isElementSelected('IDE') ? exampleCode : '',
      script_name: isElementSelected('IDE') ? scriptName : '',
      execution_command: isElementSelected('IDE') ? executionCommand : '',
      terminal_commands: isElementSelected('Terminal') ? terminalCommands : '',
      rag_urls: Array.isArray(ragUrls) ? ragUrls.slice(0, 3) : [],
  analytics_targets: isElementSelected('LabSessionAnalyzer') ? targetedActions : [],
    };
    

    try {
      const response = await fetch(`/labs/lab`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to submit form.');
      const data = await response.json();
      const extractedLabID = data._id;

      if (video && isElementSelected('Video')) {
        const formData = new FormData();
        formData.append('video', video);
        formData.append('lab_id', extractedLabID);
        await fetch(`/video/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
          body: formData,
        });
      }

      onCreated && onCreated(extractedLabID);

      // reset
      setName('');
      setContainerImage('');
      setLabText('');
      setExampleCode('');
      setScriptName('');
      setExecutionCommand('');
      setTerminalCommands('');
      setVideo(null);
      setSelectedElements([]);
      setScoredLab(false);
      setResourceSize('small');
      setSessionTtlMinutes(30);
      setRagUrls([]);
  setTargetedActions([]);
    } catch (err) {
      console.error('Error submitting form (custom):', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 border rounded-lg dark:border-cp-border dark:bg-cp-panel-alt">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-cp-panel-alt rounded-t-lg"
        aria-expanded={expanded}
      >
        <span className="text-left">
          <span className="block text-lg font-medium dark:text-neutral-100">Custom Lab</span>
          <span className="block text-sm text-gray-600 dark:text-neutral-400">Use a custom container image only. Scoring supported.</span>
        </span>
        <span className={`transform transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {expanded && (
        <div className="relative">
          <fieldset disabled={isFreeAccount} style={{ opacity: isFreeAccount ? 0.7 : 1 }}>
            <form onSubmit={handleSubmit} className="space-y-6 px-4 pb-4">
              <div className="space-y-2">
                <label htmlFor="name-custom" className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Lab Name</label>
                <input
                  id="name-custom"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
                  placeholder="Enter Lab name"
                  required
                />
              </div>
              {/* Scored Lab moved into ElementSelector */}
              <div className="space-y-2">
                <label htmlFor="containerImage-custom" className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Custom Environment</label>
                <select
                  id="containerImage-custom"
                  value={imagesList.includes(containerImage) ? containerImage : ''}
                  onChange={(e) => setContainerImage(e.target.value)}
                  disabled={isFreeAccount || imagesLoading || imagesList.length === 0}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 font-mono text-sm dark:bg-cp-panel-alt dark:text-neutral-200 ${
                    isFreeAccount || imagesLoading || imagesList.length === 0
                      ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  <option value="">
                    {isFreeAccount
                      ? 'Custom images unavailable on free plan'
                      : imagesLoading
                        ? 'Loading images...'
                        : imagesList.length === 0
                          ? 'No images available'
                          : 'Select an image'}
                  </option>
                  {imagesList.map((img) => (
                    <option key={img} value={img}>{img}</option>
                  ))}
                </select>
                {isFreeAccount && (
                  <p className="text-xs text-gray-500 dark:text-neutral-500">Upgrade to Business or Premium to use custom container images.</p>
                )}
                {imagesList.length === 0 && !imagesLoading && (
                  <p className="text-xs text-gray-500 dark:text-neutral-500">No custom images yet. Build one first in the Image Builder.</p>
                )}
              </div>

              <ElementSelector
                availableElements={availableElements}
                selectedElements={selectedElements}
                onToggle={handleElementToggle}
                scoredLab={scoredLab}
                onScoredChange={setScoredLab}
                scoredDisabled={isFreeAccount}
                idPrefix="custom"
              />

              {/* AI elements */}
              <AIElementSection
                selectedElements={selectedElements}
                onToggle={handleElementToggle}
                idPrefix="custom-ai"
                docUrls={ragUrls}
                onDocUrlsChange={setRagUrls}
                targetedActions={targetedActions}
                onTargetedActionsChange={setTargetedActions}
              />

              <ResourceSizeSection value={resourceSize} onChange={setResourceSize} idPrefix="custom" />

              <TTLSelector
                valueMinutes={sessionTtlMinutes}
                onChange={setSessionTtlMinutes}
                idPrefix="custom"
                disabled={isFreeAccount}
              />

              <LabTextSection
                active={isElementSelected('LabText')}
                value={labText}
                onChange={setLabText}
                idPrefix="custom"
              />

              <IDESection
                active={isElementSelected('IDE')}
                scriptName={scriptName}
                setScriptName={setScriptName}
                executionCommand={executionCommand}
                setExecutionCommand={setExecutionCommand}
                exampleCode={exampleCode}
                setExampleCode={setExampleCode}
                idPrefix="custom"
              />

              {ideSelected && (!scriptName.trim() || !executionCommand.trim()) && (
                <p className="text-sm text-red-600 dark:text-red-400">When IDE is selected, Script Name and Execution Command are required.</p>
              )}

              <TerminalSection
                active={isElementSelected('Terminal')}
                terminalCommands={terminalCommands}
                setTerminalCommands={setTerminalCommands}
                idPrefix="custom"
              />

              <VideoSection
                active={isElementSelected('Video')}
                onFileChange={setVideo}
                idPrefix="custom"
              />

              <button
                type="submit"
                disabled={isButtonDisabled}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center dark:text-white"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating Lab...
                  </>
                ) : (
                  'Create Custom Lab'
                )}
              </button>
            </form>
          </fieldset>
          {isFreeAccount && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-cp-panel-alt/80 z-10 rounded-lg pointer-events-auto">
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-700 dark:text-neutral-200 mb-2">Custom labs are unavailable on the Free plan</div>
                <div className="text-sm text-gray-500 dark:text-neutral-400">Upgrade to Business or Premium to unlock custom lab creation.</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CreateCustomLab;
