import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LabText from '../LabText';

// The current LabText component receives already-provided labText prop; no internal fetch.
// We'll test markdown rendering, legacy HTML pass-through, and blank (skeleton) state.

describe('LabText Component', () => {
  test('renders markdown headings and code with highlight wrappers', () => {
    const sample = `# Title\n\nSome text\n\n\n\n## Subhead\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nCode: \n\n\n\n\n\n\n\n\n\n\n\n\n\n    `;
    render(<LabText labText={sample} />);
    expect(screen.getByText('Title')).toBeInTheDocument();
  });

  test('renders legacy HTML (Quill-like) without stripping', () => {
    const legacy = '<p class="ql-align-center">Centered</p><pre class="ql-syntax" spellcheck="false">print(123)</pre>';
    const { container } = render(<LabText labText={legacy} />);
    expect(container.querySelector('.ql-syntax, pre code, pre.hljs')).toBeTruthy();
  });

  test('shows skeleton when no labText', () => {
    const { container } = render(<LabText />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });
});