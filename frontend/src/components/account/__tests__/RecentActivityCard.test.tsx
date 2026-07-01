import { render, screen } from '@testing-library/react';
import RecentActivityCard from '../RecentActivityCard';

describe('RecentActivityCard', () => {
  it('renders recent activity entries', () => {
    render(<RecentActivityCard />);

    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.getByText('Answered a question about onboarding')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument();
  });
});
