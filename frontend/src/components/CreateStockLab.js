import React, { useState, useMemo } from 'react';
import { ElementSelector, IDESection, LabTextSection, TerminalSection, VideoSection } from './SharedLabSections';

// Stock-tier lab creator (formerly Free): preset environments only; no custom images; no scored option
const CreateStockLab = ({ jwt, orgId, presetEnvironments = [], onCreated }) => {
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
  const [presetEnvironment, setPresetEnvironment] = useState('');
  const [containerImageDisplayName, setContainerImageDisplayName] = useState('');

  const availableElements = useMemo(() => ([
    { id: 'LabText', label: 'Lab Text', description: 'Rich text content for the lab' },
    { id: 'IDE', label: 'IDE', description: 'Code editor with example code' },
    { id: 'Terminal', label: 'Terminal', description: 'Terminal commands and expected output' },
    { id: 'Video', label: 'Video', description: 'Instructional video content' }
  ]), []);

  const isElementSelected = (elementId) => selectedElements.includes(elementId);
  // Free/Stock: allow any number of elements except scored lab is disabled
  const hasEnv = !!containerImage.trim();
  const isButtonDisabled = loading || !name.trim() || !hasEnv;

  const handleElementToggle = (elementId) => {
    setSelectedElements((prev) => {
      const isSelected = prev.includes(elementId);
      return isSelected ? prev.filter((id) => id !== elementId) : [...prev, elementId];
    });
  };

  const handlePresetEnvironmentChange = (event) => {
    const selectedPreset = event.target.value;
    setPresetEnvironment(selectedPreset);
    const preset = presetEnvironments.find((env) => env.id === selectedPreset);
    setContainerImageDisplayName(preset?.label);
    if (preset) {
      setContainerImage(preset.containerImage);
      setScriptName(preset.scriptName);
      setExecutionCommand(preset.executionCommand);
    } else {
      setContainerImage('');
      setScriptName('');
      setExecutionCommand('');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
  // No selection count restriction
    setLoading(true);

  // For free labs, the containerImage should already be a full registry URL from the preset
  const fullContainerImage = containerImage;

    const payload = {
      name: name,
      org_id: orgId,
      container_image: fullContainerImage,
      container_image_display_name: containerImageDisplayName,
      custom_lab: false, // free/stock tier does not support custom images
      elements: selectedElements,
      scored_lab: false, // free/stock tier does not support scored labs
      lab_text: isElementSelected('LabText') ? labText : '',
      example_code: isElementSelected('IDE') ? exampleCode : '',
      script_name: isElementSelected('IDE') ? scriptName : '',
      execution_command: isElementSelected('IDE') ? executionCommand : '',
      terminal_commands: isElementSelected('Terminal') ? terminalCommands : '',
      resource_tier: 'small', // default to small size for stock labs
      session_ttl_minutes: 30, // default to 30 minutes for stock labs
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
      setPresetEnvironment('');
    } catch (err) {
      console.error('Error submitting form (free):', err);
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
          <span className="block text-lg font-medium dark:text-neutral-100">Stock Lab</span>
          <span className="block text-sm text-gray-600 dark:text-neutral-400">Use preset base environments. Custom images and scoring are not available.</span>
        </span>
        <span className={`transform transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {expanded && (
        <form onSubmit={handleSubmit} className="space-y-6 px-4 pb-4">
          <div className="space-y-2">
            <label htmlFor="name-stock" className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Lab Name</label>
            <input
              id="name-stock"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
              placeholder="Enter Lab name"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="presetEnvironment-stock" className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Base Environment</label>
            <select
              id="presetEnvironment-stock"
              value={presetEnvironment}
              onChange={handlePresetEnvironmentChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 dark:bg-cp-panel-alt dark:text-neutral-200 border-gray-300"
            >
              <option value="">Select a base environment</option>
              {presetEnvironments.map((env) => (
                <option key={env.id} value={env.id}>{env.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-neutral-500">Selecting a preset auto-populates container image, script name, and execution command.</p>
          </div>

          <ElementSelector
            availableElements={availableElements}
            selectedElements={selectedElements}
            onToggle={handleElementToggle}
            scoredLab={false}
            onScoredChange={() => {}}
            scoredDisabled={true}
            idPrefix="stock"
          />

          <LabTextSection active={isElementSelected('LabText')} value={labText} onChange={setLabText} idPrefix="stock" />

          <IDESection
            active={isElementSelected('IDE')}
            scriptName={scriptName}
            setScriptName={setScriptName}
            executionCommand={executionCommand}
            setExecutionCommand={setExecutionCommand}
            exampleCode={exampleCode}
            setExampleCode={setExampleCode}
            idPrefix="stock"
          />

          <TerminalSection
            active={isElementSelected('Terminal')}
            terminalCommands={terminalCommands}
            setTerminalCommands={setTerminalCommands}
            idPrefix="stock"
          />

          <VideoSection active={isElementSelected('Video')} onFileChange={setVideo} idPrefix="stock" />

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
              'Create Stock Lab'
            )}
          </button>
        </form>
      )}
    </div>
  );
};

export default CreateStockLab;
