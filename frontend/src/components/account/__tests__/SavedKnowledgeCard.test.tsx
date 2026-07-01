import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SavedKnowledgeCard from '../SavedKnowledgeCard';

describe('SavedKnowledgeCard', () => {
  it('renders saved items and a link to the saved page', () => {
    render(
      <MemoryRouter>
        <SavedKnowledgeCard />
      </MemoryRouter>
    );

    expect(screen.getByText('Saved knowledge')).toBeInTheDocument();
    expect(screen.getByText('How to join the program')).toBeInTheDocument();
    expect(screen.getByText('Open saved')).toBeInTheDocument();
  });
});
