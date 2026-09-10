import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreatePostDialog from './CreatePostDialog';
import api from '../../utils/api';

vi.mock('../../utils/api', () => ({
  default: { post: vi.fn() },
  friendlyError: vi.fn(() => 'error'),
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { _id: 'user-1' } }) }));
vi.mock('../../context/AuthModalContext', () => ({ useAuthModal: () => ({ openModal: vi.fn() }) }));
vi.mock('../../hooks/useGcsUpload', () => ({ useGcsUpload: () => ({ upload: vi.fn(), uploading: false, error: null }) }));
vi.mock('../../context/BatchContext', () => ({ useBatch: () => ({ currentBatch: null }) }));
vi.mock('../explore/usePublicFaqApi', () => ({ useCategories: () => ({ data: { categories: [] } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const mockedPost = vi.mocked(api.post);

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockedPost.mockReset();
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  }
});

describe('CreatePostDialog duplicate checks', () => {
  it('ignores a stale response when the title changes while a check is in flight', async () => {
    const first = deferred<{ data: { isDuplicate: boolean; matches: unknown[] } }>();
    const second = deferred<{ data: { isDuplicate: boolean; matches: unknown[] } }>();
    mockedPost.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

    render(<CreatePostDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    const title = screen.getByRole('textbox', { name: /title/i });

    fireEvent.change(title, { target: { value: 'How do I request internship leave?' } });
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(mockedPost).toHaveBeenCalledTimes(1);

    fireEvent.change(title, { target: { value: 'How do I reset my internship password?' } });
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(mockedPost).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({ data: { isDuplicate: true, matches: [{ source: 'faq', score: 0.95, question: 'Password reset' }] } });
      await second.promise;
    });
    expect(screen.getByText('Similar question found!')).toBeInTheDocument();

    await act(async () => {
      first.resolve({ data: { isDuplicate: true, matches: [{ source: 'faq', score: 0.99, question: 'Old leave question' }] } });
      await first.promise;
    });

    expect(screen.getByText(/Password reset/)).toBeInTheDocument();
    expect(screen.queryByText(/Old leave question/)).not.toBeInTheDocument();
  });
});
