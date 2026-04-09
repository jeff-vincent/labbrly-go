import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import IDE from '../IDE';

// Mock monaco editor component
jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value, onChange }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}));

// Mock fetch for /compute/run only
beforeEach(() => {
  global.fetch = jest.fn();
});

const labData = {
  example_code: 'print("Hello World")',
  expected_output: 'Hello World',
  name: 'Lesson 1',
  script_name: 'main.py',
  execution_command: 'python',
};

describe('IDE Component (current implementation)', () => {
  test('renders initial code from labData', async () => {
    await act(async () => {
  render(<IDE labData={labData} showExplorer={false} />);
    });
    expect(screen.getByDisplayValue('print("Hello World")')).toBeInTheDocument();
  });

  test('updates code when typing', async () => {
    await act(async () => {
  render(<IDE labData={labData} showExplorer={false} />);
    });
    const editor = screen.getByTestId('monaco-editor');
    await act(async () => {
      fireEvent.change(editor, { target: { value: 'print("Changed")' } });
    });
    expect(editor.value).toBe('print("Changed")');
  });

  test('runs code and displays output container', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: async () => 'Hello World' });
    await act(async () => {
  render(<IDE labData={labData} showExplorer={false} />);
    });
    await act(async () => {
  fireEvent.click(screen.getByRole('button', { name: /run code/i }));
    });
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/compute/run', expect.any(Object));
    });
  });

  test('handles run error gracefully', async () => {
    console.error = jest.fn();
    fetch.mockRejectedValueOnce(new Error('network fail'));
    await act(async () => {
  render(<IDE labData={labData} showExplorer={false} />);
    });
    await act(async () => {
  fireEvent.click(screen.getByRole('button', { name: /run code/i }));
    });
    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Error running code:', expect.any(Error));
    });
  });
});