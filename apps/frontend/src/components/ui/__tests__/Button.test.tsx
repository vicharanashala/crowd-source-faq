import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('is disabled when loading=true', () => {
    render(<Button loading>Loading…</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is disabled when disabled=true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick when clicked (not disabled)', () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Click me</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does NOT call onClick when disabled', () => {
    const handler = vi.fn();
    render(<Button disabled onClick={handler}>Click me</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('does NOT call onClick when loading', () => {
    const handler = vi.fn();
    render(<Button loading onClick={handler}>Click me</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('shows spinner when loading', () => {
    render(<Button loading>Wait</Button>);
    const spinner = document.body.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders with each variant without crashing', () => {
    const variants = ['primary', 'secondary', 'ghost', 'accent'] as const;
    for (const v of variants) {
      const { unmount } = render(<Button variant={v}>{v}</Button>);
      expect(screen.getByRole('button', { name: v })).toBeInTheDocument();
      unmount();
    }
  });

  it('renders with each size without crashing', () => {
    const sizes = ['sm', 'md', 'lg'] as const;
    for (const s of sizes) {
      const { unmount } = render(<Button size={s}>{s}</Button>);
      expect(screen.getByRole('button', { name: s })).toBeInTheDocument();
      unmount();
    }
  });
});

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('renders with each variant without crashing', () => {
    const variants = ['success', 'warning', 'info', 'accent'] as const;
    for (const v of variants) {
      const { unmount } = render(<Badge variant={v}>{v}</Badge>);
      expect(screen.getByText(v)).toBeInTheDocument();
      unmount();
    }
  });

  it('applies custom className alongside variant class', () => {
    const { container } = render(<Badge className="mt-2">Styled</Badge>);
    expect(container.firstChild).toHaveClass('mt-2');
  });
});