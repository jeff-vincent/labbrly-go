import React, { useEffect, useMemo, useState } from 'react';
import { ElementSelector, IDESection, LabTextSection, TerminalSection, VideoSection } from './SharedLabSections';

const EditStockLab = ({ jwt, orgId, selectedLab, isFreeAccount = true, onSaved }) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [selectedElements, setSelectedElements] = useState([]);
  const [labText, setLabText] = useState('');
  const [exampleCode, setExampleCode] = useState('');
  const [scriptName, setScriptName] = useState('');
  const [executionCommand, setExecutionCommand] = useState('');
  const [terminalCommands, setTerminalCommands] = useState('');
  const [video, setVideo] = useState(null);
  // scoredLab is fixed to false for stock labs; no local state needed

  const availableElements = useMemo(() => ([
    { id: 'LabText', label: 'Lab Text', description: 'Rich text content for the lab' },
    { id: 'IDE', label: 'IDE', description: 'Code editor with example code' },
    { id: 'Terminal', label: 'Terminal', description: 'Terminal commands and expected output' },
    { id: 'Video', label: 'Video', description: 'Instructional video content' }
  ]), []);

  useEffect(() => {
    if (!selectedLab) return;
    setName(selectedLab.name || '');
    setLabText(selectedLab.lab_text || '');
    setExampleCode(selectedLab.example_code || '');
    setScriptName(selectedLab.script_name || '');
    setExecutionCommand(selectedLab.execution_command || '');
    setTerminalCommands(selectedLab.terminal_commands || '');
    setSelectedElements(selectedLab.elements || []);
    setVideo(null);
  }, [selectedLab, orgId]);

  const isElementSelected = (id) => selectedElements.includes(id);
  // Stock: allow any number of elements; scored is disabled

  const imageDisplayName = useMemo(() => {
    return selectedLab?.container_image_display_name || '';
  }, [selectedLab]);

  const handleElementToggle = (elementId) => {
    setSelectedElements((prev) => {
      const on = prev.includes(elementId);
      return on ? prev.filter((id) => id !== elementId) : [...prev, elementId];
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
  if (!selectedLab) return;
    setLoading(true);

    const payload = {
      name,
      org_id: orgId,
      elements: selectedElements,
      scored_lab: false, // stock tier cannot score
      lab_text: isElementSelected('LabText') ? labText : '',
      example_code: isElementSelected('IDE') ? exampleCode : '',
      script_name: isElementSelected('IDE') ? scriptName : '',
      execution_command: isElementSelected('IDE') ? executionCommand : '',
      terminal_commands: isElementSelected('Terminal') ? terminalCommands : '',
      // Image is locked for edits; keep the original unchanged
      container_image: selectedLab.container_image,
    };

    try {
      const response = await fetch(`/labs/lab/${selectedLab._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to update lab.');

      if (video && isElementSelected('Video')) {
        const formData = new FormData();
        formData.append('video', video);
        formData.append('lab_id', selectedLab._id);
        await fetch(`/video/upload`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: formData });
      }

      onSaved && onSaved(selectedLab._id);
    } catch (err) {
      console.error('Error updating lab (free):', err);
    } finally {
      setLoading(false);
    }
  };

  const hasEnv = !!String(selectedLab?.container_image || '').trim();
  const isButtonDisabled = loading || !name.trim() || !hasEnv;

  return (
    <div className="space-y-4 border rounded-lg dark:border-cp-border dark:bg-cp-panel-alt">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-cp-panel-alt rounded-t-lg"
        aria-expanded={expanded}
      >
        <span className="text-left">
          <span className="block text-lg font-medium dark:text-neutral-100">Stock Lab (Edit)</span>
          <span className="block text sm text-gray-600 dark:text-neutral-400">Preset environment; custom images and scoring unavailable.</span>
        </span>
        <span className={`transform transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {expanded && selectedLab && (
        <form onSubmit={handleSubmit} className="space-y-6 px-4 pb-4">
          <div className="space-y-2">
            <label htmlFor="edit-stock-name" className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Lab Name</label>
            <input
              id="edit-stock-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
              placeholder="Enter Lab name"
              required
            />
          </div>

      {/* Read-only environment */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Environment Image</label>
            <input
              type="text"
              readOnly
              value={imageDisplayName}
              title={selectedLab?.container_image || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-400 cursor-not-allowed font-mono text-xs"
              placeholder="Select a lab to view its image"
            />
            <p className="text-xs text-gray-500 dark:text-neutral-500">Image is fixed for existing labs. Create a new lab to use a different image.</p>
          </div>

          <ElementSelector
            availableElements={availableElements}
            selectedElements={selectedElements}
            onToggle={handleElementToggle}
            scoredLab={false}
            onScoredChange={() => {}}
            scoredDisabled={true}
            idPrefix="edit-stock"
          />

          <LabTextSection active={isElementSelected('LabText')} value={labText} onChange={setLabText} idPrefix="edit-stock" />

          <IDESection
            active={isElementSelected('IDE')}
            scriptName={scriptName}
            setScriptName={setScriptName}
            executionCommand={executionCommand}
            setExecutionCommand={setExecutionCommand}
            exampleCode={exampleCode}
            setExampleCode={setExampleCode}
            idPrefix="edit-stock"
          />

          <TerminalSection active={isElementSelected('Terminal')} terminalCommands={terminalCommands} setTerminalCommands={setTerminalCommands} idPrefix="edit-stock" />

          <VideoSection active={isElementSelected('Video')} onFileChange={setVideo} idPrefix="edit-stock" />

          <button
            type="submit"
            disabled={isButtonDisabled}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center dark:text-white"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving Changes...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </form>
      )}
    </div>
  );
};

export default EditStockLab;
