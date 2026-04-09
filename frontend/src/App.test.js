import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// Mock Auth0 with internal state encapsulated inside factory (no external variable capture)
jest.mock('@auth0/auth0-react', () => {
  const state = {
    isAuthenticated: false,
    isLoading: false,
    getAccessTokenSilently: jest.fn(),
  };
  return {
    useAuth0: () => state,
    __setAuthState: (next) => Object.assign(state, next),
    __resetAuthState: () => {
      state.isAuthenticated = false;
      state.isLoading = false;
      state.getAccessTokenSilently.mockReset();
    }
  };
});

// Helper to set auth state within tests
const setAuth = (updates) => {
  const mod = require('@auth0/auth0-react');
  mod.__setAuthState(updates);
  return mod.useAuth0();
};

// Mock jwt-decode
jest.mock('jwt-decode', () => ({
  jwtDecode: jest.fn()
}));

// Mock components
jest.mock('./components/Homepage', () => {
  return function Homepage() {
    return <div data-testid="homepage">Homepage</div>;
  };
});

jest.mock('./components/NotFound', () => {
  return function NotFound() {
    return <div data-testid="not-found">Not Found</div>;
  };
});

describe('App Component (simplified)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    const { __resetAuthState } = require('@auth0/auth0-react');
    __resetAuthState();
  });

  test('renders homepage by default', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('homepage')).toBeInTheDocument());
  });

  test('stores token from query param and decodes lab id', async () => {
    const { jwtDecode } = require('jwt-decode');
    jwtDecode.mockReturnValue({ lab_id: 'lab123' });
    window.history.pushState(null, '', '/?token=test.query.token');
    render(<App />);
    await waitFor(() => expect(localStorage.getItem('jwt')).toBe('test.query.token'));
  });

  test('stores token from hash param', async () => {
    const { jwtDecode } = require('jwt-decode');
    jwtDecode.mockReturnValue({ lab_id: 'lab_hash' });
    window.history.pushState(null, '', '/#token=hash.token.value');
    render(<App />);
    await waitFor(() => expect(localStorage.getItem('jwt')).toBe('hash.token.value'));
  });

  test('invalid token logs error', async () => {
    const { jwtDecode } = require('jwt-decode');
    jwtDecode.mockImplementation(() => { throw new Error('boom'); });
    console.error = jest.fn();
    window.history.pushState(null, '', '/?token=bad.token');
    render(<App />);
    await waitFor(() => expect(console.error).toHaveBeenCalled());
  });

  test('unauthenticated org path routes to signup form', async () => {
    window.history.pushState(null, '', '/org/demo');
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Create Your Free Account/i)).toBeInTheDocument());
  });
});
