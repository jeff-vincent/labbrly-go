import React from 'react';
import { render, screen } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import IDE from '../IDE';

// Minimal labData for IDE
const labData = {
  example_code: 'print("Hello World")',
  expected_output: 'Hello World',
  name: 'Lesson 1',
  script_name: 'main.py',
  execution_command: 'python'
};

describe('IDE embedded Terminal', () => {
  test('renders Terminal inside IDE when showEmbeddedTerminal=true', async () => {
    await act(async () => {
      render(<IDE labData={labData} showExplorer={false} showEmbeddedTerminal={true} embeddedTerminalText={"Welcome!"} />);
    });
    // Terminal root has data-component="terminal"
    const terminal = screen.getByTestId ? screen.getByTestId('terminal') : document.querySelector('[data-component="terminal"]');
    expect(terminal).toBeTruthy();
  });
});
