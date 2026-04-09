import React, { useEffect, useMemo, useState } from 'react';
import { ElementSelector, IDESection, LabTextSection, TerminalSection, VideoSection, ResourceSizeSection, TTLSelector, AIElementSection } from './SharedLabSections';

const EditCustomLab = ({ jwt, orgId, orgData, selectedLab, isFreeAccount = false, onSaved }) => {
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
  const [scoredLab, setScoredLab] = useState(false);
  const [resourceSize, setResourceSize] = useState('small');
  const [sessionTtlMinutes, setSessionTtlMinutes] = useState(30);
  const [ragUrls, setRagUrls] = useState([]);
  const [targetedActions, setTargetedActions] = useState([]);
  const imageDisplayName = useMemo(() => selectedLab?.container_image_display_name || '', [selectedLab]);

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
    setScoredLab(!!selectedLab.scored_lab);
    setResourceSize(selectedLab.resource_tier || 'small');
    setSessionTtlMinutes(selectedLab.session_ttl_minutes || 30);
    setVideo(null);
  try { setRagUrls(Array.isArray(selectedLab?.rag_urls) ? selectedLab.rag_urls.slice(0, 3) : []); } catch { setRagUrls([]); }
  try { setTargetedActions(Array.isArray(selectedLab?.analytics_targets) ? selectedLab.analytics_targets : []); } catch { setTargetedActions([]); }

  // Image is read-only for existing labs; display comes from container_image_display_name
  }, [selectedLab, orgId]);

  const isElementSelected = (id) => selectedElements.includes(id);
  // No restriction on number of components for custom labs

  const imagesList = Array.isArray(orgData?.images) ? orgData.images : [];
  const imagesLoading = orgId && !orgData;

  const handleElementToggle = (elementId) => {
    setSelectedElements((prev) => {
      const on = prev.includes(elementId);
      return on ? prev.filter((id) => id !== elementId) : [...prev, elementId];
    });
  };

  const hasEnv = !!String(selectedLab?.container_image || '').trim();
  const ideSelected = isElementSelected('IDE');
  const ideValid = !ideSelected || (scriptName.trim() && executionCommand.trim());
  const isButtonDisabled = loading || !name.trim() || !hasEnv || !ideValid;

  const handleSubmit = async (e) => {
    e.preventDefault();
  if (!selectedLab) return;
    // Validate IDE fields if IDE is selected
    const _ideSelected = isElementSelected('IDE');
    if (_ideSelected && (!scriptName.trim() || !executionCommand.trim())) {
      return;
    }
    setLoading(true);

    const payload = {
      name,
      org_id: orgId,
      elements: selectedElements,
      scored_lab: isFreeAccount ? false : scoredLab,
  resource_tier: resourceSize,
  session_ttl_minutes: isFreeAccount ? 30 : Number(sessionTtlMinutes) || 30,
      lab_text: isElementSelected('LabText') ? labText : '',
      example_code: isElementSelected('IDE') ? exampleCode : '',
      script_name: isElementSelected('IDE') ? scriptName : '',
      execution_command: isElementSelected('IDE') ? executionCommand : '',
      terminal_commands: isElementSelected('Terminal') ? terminalCommands : '',
  rag_urls: Array.isArray(ragUrls) ? ragUrls.slice(0, 3) : [],
  analytics_targets: isElementSelected('LabSessionAnalyzer') ? targetedActions : [],
  // Image is locked on edit; keep original unchanged
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
      console.error('Error updating lab (custom):', err);
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
          <span className="block text-lg font-medium dark:text-neutral-100">Custom Lab (Edit)</span>
          <span className="block text-sm text-gray-600 dark:text-neutral-400">Edit content. Image and base environment are fixed for existing labs.</span>
        </span>
        <span className={`transform transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {expanded && selectedLab && (
        <form onSubmit={handleSubmit} className="space-y-6 px-4 pb-4">
          <div className="space-y-2">
            <label htmlFor="edit-custom-name" className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Lab Name</label>
            <input
              id="edit-custom-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-200"
              placeholder="Enter Lab name"
              required
            />
          </div>

      {/* Read-only environment info */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300">Environment Image</label>
            <input
              type="text"
              readOnly
        value={imageDisplayName}
        title={selectedLab?.container_image || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 dark:bg-cp-panel-alt dark:border-cp-border dark:text-neutral-400 cursor-not-allowed font-mono text-xs"
            />
            <p className="text-xs text-gray-500 dark:text-neutral-500">Image is fixed for existing labs.</p>
          </div>

          {/* Scored Lab moved into ElementSelector */}

          <ElementSelector
            availableElements={availableElements}
            selectedElements={selectedElements}
            onToggle={handleElementToggle}
            scoredLab={scoredLab}
            onScoredChange={setScoredLab}
            scoredDisabled={isFreeAccount}
            idPrefix="edit-custom"
          />

          {/* AI elements */}
          <AIElementSection
            selectedElements={selectedElements}
            onToggle={handleElementToggle}
            idPrefix="edit-custom-ai"
            docUrls={ragUrls}
            onDocUrlsChange={setRagUrls}
            targetedActions={targetedActions}
            onTargetedActionsChange={setTargetedActions}
          />

          <ResourceSizeSection value={resourceSize} onChange={setResourceSize} idPrefix="edit-custom" />

          <TTLSelector
            valueMinutes={sessionTtlMinutes}
            onChange={setSessionTtlMinutes}
            idPrefix="edit-custom"
            disabled={isFreeAccount}
          />

          <LabTextSection active={isElementSelected('LabText')} value={labText} onChange={setLabText} idPrefix="edit-custom" />

          <IDESection
            active={isElementSelected('IDE')}
            scriptName={scriptName}
            setScriptName={setScriptName}
            executionCommand={executionCommand}
            setExecutionCommand={setExecutionCommand}
            exampleCode={exampleCode}
            setExampleCode={setExampleCode}
            idPrefix="edit-custom"
          />

          {ideSelected && (!scriptName.trim() || !executionCommand.trim()) && (
            <p className="text-sm text-red-600 dark:text-red-400">When IDE is selected, Script Name and Execution Command are required.</p>
          )}

          <TerminalSection active={isElementSelected('Terminal')} terminalCommands={terminalCommands} setTerminalCommands={setTerminalCommands} idPrefix="edit-custom" />

          <VideoSection active={isElementSelected('Video')} onFileChange={setVideo} idPrefix="edit-custom" />

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

export default EditCustomLab;
