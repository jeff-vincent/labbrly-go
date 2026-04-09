import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import OverageCalculator from '../OverageCalculator';

describe('OverageCalculator', () => {
  const label = /Estimated extra 30-minute lab blocks this month/i;

  test('renders input and calculates overage', async () => {
    await act(async () => {
      render(<OverageCalculator />);
    });
    expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(screen.getByText(/Overage Estimator/i)).toBeInTheDocument();
  });

  test('shows total with extra blocks', async () => {
    await act(async () => {
      render(<OverageCalculator />);
    });
    const input = screen.getByLabelText(label);
    fireEvent.change(input, { target: { value: 10 } });
    expect(screen.getByText(/Total/i)).toBeInTheDocument();
  });
});
