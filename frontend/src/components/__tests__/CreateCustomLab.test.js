import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateCustomLab from '../CreateCustomLab';

// Minimal props for rendering
const baseProps = {
  jwt: 'test-jwt',
  orgId: 'org_123',
  orgData: { images: ['img1'] },
  presetEnvironments: [],
  isFreeAccount: false,
  onCreated: jest.fn(),
};

describe('CreateCustomLab', () => {
  function expandForm() {
    // Expand the Custom Lab section if it's collapsed
    const sectionButton = screen.queryByRole('button', { name: /Custom Lab/i });
    if (sectionButton) {
      fireEvent.click(sectionButton);
    }
  }

  function selectAllElements() {
    // Only select checkboxes that exist in the DOM
    ['Lab Text', 'IDE', 'Terminal', 'Video'].forEach(label => {
      const checkbox = screen.queryByLabelText(label);
      if (checkbox && !checkbox.checked) {
        fireEvent.click(checkbox);
      }
    });
  }

  test('renders form fields', () => {
    render(<CreateCustomLab {...baseProps} />);
    expandForm();
    selectAllElements();
    expect(screen.getByLabelText(/Lab Name/i)).toBeInTheDocument();
    // Use getAllByText to avoid multiple match error
    expect(screen.getAllByText(/Lab Text/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/IDE/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Terminal/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Video/i).length).toBeGreaterThan(0);
  });

  test('disables submit if required fields are missing', () => {
    render(<CreateCustomLab {...baseProps} />);
    expandForm();
    selectAllElements();
    // Button is named 'Create Custom Lab' in this form
    expect(screen.getByRole('button', { name: /Create Custom Lab/i })).toBeDisabled();
  });

  test('calls onCreated after successful submit', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<CreateCustomLab {...baseProps} />);
    expandForm();
    selectAllElements();
    fireEvent.change(screen.getByLabelText(/Lab Name/i), { target: { value: 'My Lab' } });
  fireEvent.change(screen.getByLabelText(/Custom Environment/i), { target: { value: 'img1' } });
    // Fill required IDE fields
    fireEvent.change(screen.getByLabelText(/Script Name/i), { target: { value: 'main.py' } });
    fireEvent.change(screen.getByLabelText(/Execution Command/i), { target: { value: 'python' } });
    // Use getAllByText for Lab Text
    fireEvent.click(screen.getAllByText(/Lab Text/i)[0]);
    fireEvent.click(screen.getByRole('button', { name: /Create Custom Lab/i }));
    await waitFor(() => expect(baseProps.onCreated).toHaveBeenCalled());
  });
});
