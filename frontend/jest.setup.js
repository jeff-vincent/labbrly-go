// Global Jest setup for frontend tests
// Mocks xterm, canvas, and common browser APIs for jsdom
global.window.HTMLCanvasElement.prototype.getContext = () => {
  // minimal mock for xterm
  return {};
};

jest.mock('xterm', () => ({
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
      dispose: jest.fn(),
    };
  }
}));

// Mock matchMedia for components using media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock scrollTo
window.scrollTo = jest.fn();
