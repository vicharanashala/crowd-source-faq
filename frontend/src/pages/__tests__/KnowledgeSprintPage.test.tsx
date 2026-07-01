import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import KnowledgeSprintPage from '../KnowledgeSprintPage';

describe('KnowledgeSprintPage', () => {
  it('tracks challenge progress when a task is completed', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <KnowledgeSprintPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Knowledge Sprint')).toBeInTheDocument();
    expect(screen.getByText('0 of 3 completed')).toBeInTheDocument();

    const completeButtons = screen.getAllByRole('button', { name: /complete/i });
    await user.click(completeButtons[0]);

    expect(screen.getByText('1 of 3 completed')).toBeInTheDocument();
  });
});
