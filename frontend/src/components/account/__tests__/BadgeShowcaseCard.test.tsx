import { render, screen } from '@testing-library/react';
import BadgeShowcaseCard from '../BadgeShowcaseCard';

describe('BadgeShowcaseCard', () => {
  it('renders badge names and a summary label', () => {
    render(<BadgeShowcaseCard />);

    expect(screen.getByText('Badge showcase')).toBeInTheDocument();
    expect(screen.getByText('Helpful Voice')).toBeInTheDocument();
    expect(screen.getByText('3 earned')).toBeInTheDocument();
  });
});
