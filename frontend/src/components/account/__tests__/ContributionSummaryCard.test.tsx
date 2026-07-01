import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ContributionSummaryCard from '../ContributionSummaryCard';

describe('ContributionSummaryCard', () => {
  it('renders the summary stats and a link to achievements', () => {
    render(
      <MemoryRouter>
        <ContributionSummaryCard />
      </MemoryRouter>
    );

    expect(screen.getByText('Contribution summary')).toBeInTheDocument();
    expect(screen.getByText('Questions')).toBeInTheDocument();
    expect(screen.getByText('Answers')).toBeInTheDocument();
    expect(screen.getByText('View achievements')).toBeInTheDocument();
  });
});
