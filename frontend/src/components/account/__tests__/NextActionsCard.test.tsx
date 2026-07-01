import { render, screen } from '@testing-library/react';
import NextActionsCard from '../NextActionsCard';

describe('NextActionsCard', () => {
  it('renders recommended actions', () => {
    render(<NextActionsCard />);

    expect(screen.getByText('Recommended next actions')).toBeInTheDocument();
    expect(screen.getByText('Explore new topics')).toBeInTheDocument();
    expect(screen.getAllByText('Start')).toHaveLength(3);
  });
});
