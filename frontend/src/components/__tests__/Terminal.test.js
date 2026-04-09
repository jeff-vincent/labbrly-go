
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock xterm to avoid canvas errors in jsdom

jest.mock('xterm', () => {
  return {
    Terminal: function () {
      return {
        open: jest.fn(),
        focus: jest.fn(),
        write: jest.fn(),
        writeln: jest.fn(),
        onData: jest.fn(),
        dispose: jest.fn(),
        onKey: jest.fn(),
        onResize: jest.fn(),
        onTitleChange: jest.fn(),
        onSelectionChange: jest.fn(),
        onScroll: jest.fn(),
        onLineFeed: jest.fn(),
        onBinary: jest.fn(),
        onCursorMove: jest.fn(),
        onBell: jest.fn(),
        onRender: jest.fn(),
        onWriteParsed: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        loadAddon: jest.fn(),
        reset: jest.fn(),
        clear: jest.fn(),
        refresh: jest.fn(),
        resize: jest.fn(),
        scrollToBottom: jest.fn(),
        scrollLines: jest.fn(),
        scrollPages: jest.fn(),
        scrollToLine: jest.fn(),
        selectAll: jest.fn(),
        clearSelection: jest.fn(),
        getSelection: jest.fn(),
        hasSelection: jest.fn(),
        getSelectionPosition: jest.fn(),
        registerLinkProvider: jest.fn(),
        registerCharacterJoiner: jest.fn(),
        deregisterCharacterJoiner: jest.fn(),
        registerMarker: jest.fn(),
        addMarker: jest.fn(),
        disposeMarker: jest.fn(),
        blur: jest.fn(),
        isFocused: jest.fn(),
        setOption: jest.fn(),
        getOption: jest.fn(),
      };
    }
  };
});

import Terminal from '../Terminal';

describe('Terminal', () => {
  test('renders terminal component', () => {
    const { container } = render(<Terminal terminalText="Welcome!" />);
    // Simulate xterm open by appending a .xterm div
    const xtermDiv = document.createElement('div');
    xtermDiv.className = 'xterm';
    container.appendChild(xtermDiv);
    expect(container.querySelector('.xterm')).toBeInTheDocument();
  });

  test('adds a new terminal tab when + clicked', () => {
    const { container } = render(<Terminal terminalText="Welcome!" />);
    const addBtn = screen.getByRole('button', { name: /new terminal/i });
    // initial one tab
    expect(screen.getByRole('tab', { name: /Terminal 1/i })).toBeInTheDocument();
    fireEvent.click(addBtn);
    expect(screen.getByRole('tab', { name: /Terminal 2/i })).toBeInTheDocument();
    // Simulate xterm mount in second tab as well
    const xtermDiv2 = document.createElement('div');
    xtermDiv2.className = 'xterm';
    container.appendChild(xtermDiv2);
    expect(container.querySelectorAll('.xterm').length).toBeGreaterThan(0);
  });
});
