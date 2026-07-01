import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AchievementsPage from '../AchievementsPage';

describe('AchievementsPage', () => {
  it('renders the achievement overview and key stats', () => {
    render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Achievement Hub')).toBeInTheDocument();
    expect(screen.getByText('Contribution stats')).toBeInTheDocument();
    expect(screen.getByText('Next milestone')).toBeInTheDocument();
  });
});
