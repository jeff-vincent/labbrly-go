import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Homepage from '../Homepage';

// Mock fetch
global.fetch = jest.fn();

const MockedHomepage = () => (
  <BrowserRouter>
    <Homepage />
  </BrowserRouter>
);

describe('Homepage Component', () => {
  beforeEach(() => {
    fetch.mockClear();
    // Pretend Chrome so alert not triggered in JSDOM env
    Object.defineProperty(window.navigator, 'userAgent', { value: 'Chrome', configurable: true });
  });

  test('renders new hero headings', () => {
    render(<MockedHomepage />);
    // Main hero h1 contains Build  10x  Labs (with styled span). Use regex ignoring extra spaces.
    expect(screen.getByRole('heading', { level: 1, name: /Build\s+10x\s+Labs/i })).toBeInTheDocument();
    // Subheading h2: and Stuff.
    expect(screen.getByRole('heading', { level: 2, name: /and Stuff\./i })).toBeInTheDocument();
  });

  test('renders primary CTA buttons (new copy)', () => {
    render(<MockedHomepage />);
    expect(screen.getByRole('button', { name: /Create a Free Account/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Live Demo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Learn More/i })).toBeInTheDocument();
    // Multiple Docs buttons (nav + hero); ensure at least one
    const docsBtns = screen.getAllByRole('button', { name: /^Docs$/i });
    expect(docsBtns.length).toBeGreaterThanOrEqual(1);
  });

  test('renders pricing section heading', () => {
    render(<MockedHomepage />);
    expect(screen.getByRole('heading', { name: /Pricing During Early Access/i })).toBeInTheDocument();
  });

  test('renders FAQ section', () => {
    render(<MockedHomepage />);
    expect(screen.getByRole('heading', { name: /FAQ/i })).toBeInTheDocument();
    expect(screen.getByText(/How is this different from infra training platforms\?/i)).toBeInTheDocument();
  });
});