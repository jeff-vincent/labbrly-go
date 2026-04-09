
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  deriveEditorLanguage,
  RESOURCE_SPECS,
  ResourceSizeSection,
  TTLSelector,
  ElementSelector,
  LabTextSection,
  IDESection,
  TerminalSection,
  VideoSection
} from '../SharedLabSections';

describe('deriveEditorLanguage', () => {
  it('returns correct language for known commands', () => {
    expect(deriveEditorLanguage('python')).toBe('python');
    expect(deriveEditorLanguage('node')).toBe('javascript');
    expect(deriveEditorLanguage('go')).toBe('go');
    expect(deriveEditorLanguage('')).toBe('python');
    expect(deriveEditorLanguage(undefined)).toBe('python');
  });
});

describe('RESOURCE_SPECS', () => {
  it('contains small, medium, and large specs', () => {
    expect(RESOURCE_SPECS).toHaveProperty('small');
    expect(RESOURCE_SPECS).toHaveProperty('medium');
    expect(RESOURCE_SPECS).toHaveProperty('large');
  });
});

describe('ResourceSizeSection', () => {
  it('renders all resource size options', () => {
    render(<ResourceSizeSection value="small" onChange={() => {}} idPrefix="test" />);
    expect(screen.getByText(/Small/)).toBeInTheDocument();
    expect(screen.getByText(/Medium/)).toBeInTheDocument();
    expect(screen.getByText(/Large/)).toBeInTheDocument();
  });
  it('calls onChange when a different option is selected', () => {
    const handleChange = jest.fn();
    render(<ResourceSizeSection value="small" onChange={handleChange} idPrefix="test" />);
    // Find the radio input for "medium" by value
    const mediumRadio = screen.getByDisplayValue('medium');
    fireEvent.click(mediumRadio);
    expect(handleChange).toHaveBeenCalledWith('medium');
  });
});

describe('TTLSelector', () => {
  it('renders preset options and custom input', () => {
    render(<TTLSelector valueMinutes={30} onChange={() => {}} idPrefix="test" />);
    expect(screen.getByText('30 minutes')).toBeInTheDocument();
    expect(screen.getByText('1 hour')).toBeInTheDocument();
    expect(screen.getByText('4 hours')).toBeInTheDocument();
    expect(screen.getByText('24 hours')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Custom (mins)')).toBeInTheDocument();
  });
  it('calls onChange when a preset is selected', () => {
    const handleChange = jest.fn();
    render(<TTLSelector valueMinutes={30} onChange={handleChange} idPrefix="test" />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '60' } });
    expect(handleChange).toHaveBeenCalledWith(60);
  });
  it('calls onChange when a custom value is entered', () => {
    const handleChange = jest.fn();
    render(<TTLSelector valueMinutes={45} onChange={handleChange} idPrefix="test" />);
    const input = screen.getByPlaceholderText('Custom (mins)');
    fireEvent.change(input, { target: { value: '90' } });
    expect(handleChange).toHaveBeenCalledWith(90);
  });
});

describe('ElementSelector', () => {
  const availableElements = [
    { id: 'ide', label: 'IDE', description: 'Code editor' },
    { id: 'terminal', label: 'Terminal', description: 'Shell access' }
  ];
  const selectedElements = ['ide'];
  it('renders all available elements and scoredLab checkbox', () => {
    render(
      <ElementSelector
        availableElements={availableElements}
        selectedElements={selectedElements}
        onToggle={() => {}}
        idPrefix="test"
        scoredLab={false}
        onScoredChange={() => {}}
      />
    );
    expect(screen.getByLabelText('IDE')).toBeInTheDocument();
    expect(screen.getByLabelText('Terminal')).toBeInTheDocument();
    expect(screen.getByLabelText(/Scored Lab/)).toBeInTheDocument();
  });
  it('calls onToggle when an element is toggled', () => {
    const handleToggle = jest.fn();
    render(
      <ElementSelector
        availableElements={availableElements}
        selectedElements={[]}
        onToggle={handleToggle}
        idPrefix="test"
        scoredLab={false}
        onScoredChange={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText('IDE'));
    expect(handleToggle).toHaveBeenCalledWith('ide');
  });
  it('calls onScoredChange when scoredLab is toggled', () => {
    const handleScored = jest.fn();
    render(
      <ElementSelector
        availableElements={availableElements}
        selectedElements={[]}
        onToggle={() => {}}
        idPrefix="test"
        scoredLab={false}
        onScoredChange={handleScored}
      />
    );
    fireEvent.click(screen.getByLabelText(/Scored Lab/));
    expect(handleScored).toHaveBeenCalledWith(true);
  });
});

describe('LabTextSection', () => {
  it('renders markdown editor and label', () => {
    render(<LabTextSection active={true} value={"# Hello"} onChange={() => {}} idPrefix="test" />);
    expect(screen.getByText('Lab Text Content')).toBeInTheDocument();
    // The label exists, but is for a div, so just check for the label text and the editor container
    expect(screen.getByText('Lab Content')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument(); // Markdown rendered
  });
});

describe('IDESection', () => {
  it('renders script name, execution command, and code editor', () => {
    render(
      <IDESection
        active={true}
        scriptName="main.py"
        setScriptName={() => {}}
        executionCommand="python"
        setExecutionCommand={() => {}}
        exampleCode="print('hi')"
        setExampleCode={() => {}}
        idPrefix="test"
      />
    );
    expect(screen.getByLabelText('Script Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Execution Command')).toBeInTheDocument();
    // Monaco editor is not a native input, so check for the label and the loading text
    expect(screen.getByText('Example Code')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

describe('TerminalSection', () => {
  it('renders textarea for terminal commands', () => {
    render(
      <TerminalSection
        active={true}
        terminalCommands="ls -l"
        setTerminalCommands={() => {}}
        idPrefix="test"
      />
    );
    expect(screen.getByLabelText('Terminal Commands & Expected Output')).toBeInTheDocument();
  });
});

describe('VideoSection', () => {
  it('renders file input for video', () => {
    render(
      <VideoSection
        active={true}
        onFileChange={() => {}}
        idPrefix="test"
      />
    );
    expect(screen.getByLabelText('Video File')).toBeInTheDocument();
  });
});
