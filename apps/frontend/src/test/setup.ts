import '@testing-library/jest-dom';
import { vi } from 'vitest';

URL.createObjectURL = vi.fn(() => 'blob:signature-preview');
URL.revokeObjectURL = vi.fn();
