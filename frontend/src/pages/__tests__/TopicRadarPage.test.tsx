import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopicRadarPage from '../TopicRadarPage';

describe('TopicRadarPage', () => {
  it('renders trending topics and quick filters', () => {
    render(
      <MemoryRouter>
        <TopicRadarPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Topic Radar')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /trending now/i })).toBeInTheDocument();
    expect(screen.getAllByText('Fast response')).toHaveLength(2);
  });
});
