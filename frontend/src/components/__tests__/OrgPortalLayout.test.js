import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import OrgPortalLayout from '../OrgPortalLayout';

// Mock Auth0 hook with internal mutable state (avoid referencing outer variable directly)
jest.mock('@auth0/auth0-react', () => {
  const state = {
    isAuthenticated: true,
    isLoading: false,
    getAccessTokenSilently: jest.fn().mockResolvedValue('fake-token')
  };
  return {
    useAuth0: () => state,
    __setAuthState: (next) => Object.assign(state, next),
    __resetAuthState: () => {
      state.isAuthenticated = true;
      state.isLoading = false;
      state.getAccessTokenSilently.mockReset();
      state.getAccessTokenSilently.mockResolvedValue('fake-token');
    }
  };
});

// Helper render
const renderLayout = () => render(<BrowserRouter><OrgPortalLayout /></BrowserRouter>);

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ api_keys: [], account_type: 'business' }) });
});

describe('OrgPortalLayout navigation', () => {
  test('renders sidebar navigation items after auth/org fetch', async () => {
    renderLayout();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const sidebar = screen.getByRole('navigation', { name: /Organization navigation/i });
    expect(within(sidebar).getByRole('button', { name: /Labs/i })).toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: /API Keys/i })).toBeInTheDocument();
  });

  test('switching sections updates aria-current and content', async () => {
    renderLayout();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const sidebar = screen.getByRole('navigation', { name: /Organization navigation/i });
    const orgInfoBtn = within(sidebar).getByRole('button', { name: /Org Info/i });
    fireEvent.click(orgInfoBtn);
    await waitFor(() => expect(orgInfoBtn).toHaveAttribute('aria-current', 'page'));
  // Use heading role to avoid matching sidebar section label <h2> and content label simultaneously
  const orgHeading = screen.getAllByRole('heading', { name: /Organization/i })[0];
  expect(orgHeading).toBeInTheDocument();
  });
});