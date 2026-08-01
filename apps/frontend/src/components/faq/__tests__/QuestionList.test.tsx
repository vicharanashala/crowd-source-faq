import React from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import QuestionList from '../QuestionList';

describe('QuestionList empty state', () => {
  it('shows a clear filters action and resets the visible list when clicked', () => {
    const fullList = [
      {
        _id: 'q-1',
        question: 'How do I submit a claim?',
        answer: 'Submit the claim from the Support tab.',
        category: 'General',
        source: 'faq',
        sourceType: 'faq',
        trustLevel: 'high',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ] as any;

    function TestHarness() {
      const [filter, setFilter] = React.useState('zzz');
      const filteredItems = filter ? [] : fullList;

      return (
        <QuestionList
          items={filteredItems}
          loading={false}
          sortOption="relevant"
          onSortChange={() => {}}
          visibleCount={filteredItems.length}
          onLoadMore={() => {}}
          emptyMessage="No questions match your filters."
          onClearEmptyState={() => setFilter('')}
        />
      );
    }

    render(<TestHarness />);

    expect(screen.getByText('No questions match your filters.')).toBeInTheDocument();
    const clearButton = screen.getByRole('button', { name: 'Clear filters' });
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);

    expect(screen.getByText('How do I submit a claim?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });
});
