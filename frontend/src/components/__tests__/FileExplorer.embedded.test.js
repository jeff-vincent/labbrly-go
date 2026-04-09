import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FileExplorer from '../FileExplorer';

// Minimal fetch mock helper
const createFetchMock = (handlers) => async (url, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase();
  const key = `${method} ${typeof url === 'string' ? url : url.toString()}`;
  const handler = handlers[key] || handlers[method] || handlers['*'];
  if (!handler) throw new Error(`No fetch mock for ${key}`);
  const result = await handler(url, opts);
  const ok = result.status >= 200 && result.status < 300;
  return {
    ok,
    status: result.status,
    json: async () => result.json,
    text: async () => JSON.stringify(result.json),
    headers: new Map(),
  };
};

describe('FileExplorer embedded inline actions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // eslint-disable-next-line no-undef
    global.fetch = jest.fn();
  });

  test('shows inline rename and delete confirmations in embedded mode', async () => {
    // Seed a simple tree with one file and one folder
    const listResponse = {
      status: 200,
      json: {
        entries: [
          { name: 'notes.txt', path: './notes.txt', type: 'file' },
          { name: 'docs', path: './docs', type: 'dir' },
        ],
      },
    };

    const childListResponse = {
      status: 200,
      json: { entries: [{ name: 'readme.md', path: './docs/readme.md', type: 'file' }] },
    };

    // Track rename/delete body payloads
    const calls = { rename: [], del: [], lists: 0 };

    // Install fetch mock
    global.fetch.mockImplementation(
      createFetchMock({
        GET: async (url) => {
          const u = typeof url === 'string' ? new URL(url, 'http://localhost') : url;
          if (u.pathname === '/compute/fs/list') {
            calls.lists += 1;
            const p = u.searchParams.get('path');
            if (!p || p === '.') return listResponse;
            if (p === './docs') return childListResponse;
            return { status: 200, json: { entries: [] } };
          }
          return { status: 404, json: { error: 'not found' } };
        },
        'POST /compute/fs/rename': async (_url, opts) => {
          calls.rename.push(JSON.parse(opts.body));
          return { status: 200, json: { ok: true } };
        },
        'POST /compute/fs/delete': async (_url, opts) => {
          calls.del.push(JSON.parse(opts.body));
          return { status: 200, json: { ok: true } };
        },
        '*': async () => ({ status: 200, json: {} }),
      })
    );

  render(<FileExplorer embedded forceAutoLoad rootPath="." onOpenFile={jest.fn()} />);

    // Wait for root to load
    await waitFor(() => {
      expect(screen.getByText('notes.txt')).toBeInTheDocument();
    });

    // Click rename button for notes.txt
    const fileRow = screen.getByText('notes.txt').closest('div');
    expect(fileRow).toBeInTheDocument();
    const renameBtn = fileRow.querySelector('button[aria-label="Rename"]');
    fireEvent.click(renameBtn);

    // Inline input should appear; type new name and save
    const input = await screen.findByDisplayValue('notes.txt');
    fireEvent.change(input, { target: { value: 'notes-renamed.txt' } });
    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);

    // Rename should have been called
    await waitFor(() => expect(calls.rename.length).toBeGreaterThan(0));
    expect(calls.rename[0]).toEqual({ src: './notes.txt', dest: 'notes-renamed.txt' });

    // Click delete on docs folder; should reveal inline confirm
    const folderRow = screen.getByText('docs').closest('div');
    const delBtn = folderRow.querySelector('button[aria-label="Delete folder"]');
    fireEvent.click(delBtn);
    const confirm = await screen.findByText('Confirm');
    fireEvent.click(confirm);

    await waitFor(() => expect(calls.del.length).toBeGreaterThan(0));
    expect(calls.del[0]).toEqual({ path: './docs' });
  });
});
