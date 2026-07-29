import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode }) => (
      <div {...(props as Record<string, unknown>)}>{children}</div>
    ),
  },
}));

vi.mock('../../../utils/sigRemover', () => ({
  removeSignatureBackground: vi.fn().mockResolvedValue('data:image/png;base64,c2lnbmF0dXJl'),
}));

vi.mock('../PremiumTee', () => ({
  default: () => <div data-testid="premium-tee" />,
}));

vi.mock('../../../utils/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

import api from '../../../utils/api';
import SignatureTool from '../SignatureTool';

const mockApi = api as unknown as {
  post: ReturnType<typeof vi.fn>;
};

describe('SignatureTool', () => {
  it('submits an uploaded signature and reports the saved overlay', async () => {
    const onSigned = vi.fn();
    mockApi.post.mockResolvedValue({
      data: {
        signature: {
          id: 'signature-1',
          signerDataUrl: 'data:image/png;base64,c2F2ZWQ=',
          face: 'back',
          x: 0.7,
          y: 0.55,
          scale: 0.6,
          rotation: 0,
        },
      },
    });

    const { container } = render(
      <SignatureTool
        shareId="share-1"
        shirtColor="navy"
        textColor="cream"
        nameOnBack="Test Tee"
        existingSignatures={[]}
        defaultSignerName="Test Signer"
        onCancel={vi.fn()}
        onSigned={onSigned}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /upload/i }));
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, {
      target: { files: [new File(['signature'], 'signature.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use this signature →' }));

    await screen.findByRole('button', { name: 'Save signature' });
    fireEvent.click(screen.getByRole('button', { name: 'Save signature' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith(
      '/tee/share/share-1/sign',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ));
    await waitFor(() => expect(onSigned).toHaveBeenCalledWith(expect.objectContaining({
      id: 'signature-1',
      dataUrl: 'data:image/png;base64,c2F2ZWQ=',
    })));
  });
});
