import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessageReaction } from '../integrations/discord/discordIngestionService.js';
import { Types } from 'mongoose';

// Hoisted mocks for dependencies
const mockFaqCreate = vi.fn();
const mockChatWithConfig = vi.fn();
const mockGetPipelineProviderConfig = vi.fn();

vi.mock('../modules/faq/faq.model.js', () => ({
  default: {
    create: (data: any) => mockFaqCreate(data),
  },
}));

vi.mock('../utils/ai/aiProvider.js', () => ({
  chatWithConfig: (cfg: any, msgs: any[]) => mockChatWithConfig(cfg, msgs),
  getPipelineProviderConfig: (name: string) => mockGetPipelineProviderConfig(name),
}));

// Mock logger to avoid spamming test output
vi.mock('../utils/http/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('discordIngestionService: handleMessageReaction', () => {
  const dummyConfig = {
    batchId: new Types.ObjectId().toString(),
    guildId: '123456789',
    botToken: 'mock-token',
    applicationId: 'mock-app-id',
    clientId: 'mock-client-id',
    webhookUrl: null,
    notificationChannelId: null,
    adminUserIds: [],
    publicChannelId: null,
    publicUrl: 'http://localhost:6767',
    internalApiKey: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores bots reacting', async () => {
    const mockReaction = {
      emoji: { name: '✅' },
      partial: false,
      message: {
        author: { bot: false },
        content: 'answer content',
        react: vi.fn(),
      },
    };
    const mockUser = { bot: true, tag: 'bot#1234' };

    await handleMessageReaction(mockReaction as any, mockUser as any, dummyConfig);

    expect(mockFaqCreate).not.toHaveBeenCalled();
  });

  it('ignores non-trigger emojis', async () => {
    const mockReaction = {
      emoji: { name: '👎' },
      partial: false,
      message: {
        author: { bot: false },
        content: 'answer content',
        react: vi.fn(),
      },
    };
    const mockUser = { bot: false, tag: 'user#1234' };

    await handleMessageReaction(mockReaction as any, mockUser as any, dummyConfig);

    expect(mockFaqCreate).not.toHaveBeenCalled();
  });

  it('ignores bot-authored messages', async () => {
    const mockReaction = {
      emoji: { name: '✅' },
      partial: false,
      message: {
        author: { bot: true },
        content: 'bot answer content',
        react: vi.fn(),
      },
    };
    const mockUser = { bot: false, tag: 'user#1234' };

    await handleMessageReaction(mockReaction as any, mockUser as any, dummyConfig);

    expect(mockFaqCreate).not.toHaveBeenCalled();
  });

  it('extracts Q&A and creates a pending FAQ from thread context', async () => {
    const mockReact = vi.fn();
    const fetchStarterMessageMock = vi.fn().mockResolvedValue({ content: 'What is the program deadline?' });
    const mockReaction = {
      emoji: { name: '✅' },
      partial: false,
      message: {
        id: 'msg_98765',
        author: { bot: false },
        content: 'The deadline is next Monday.',
        channel: {
          isThread: () => true,
          fetchStarterMessage: fetchStarterMessageMock,
        },
        react: mockReact,
      },
    };
    const mockUser = { bot: false, tag: 'reviewer#5678' };

    mockGetPipelineProviderConfig.mockResolvedValue({ provider: 'openai', model: 'gpt-4' });
    mockChatWithConfig.mockResolvedValue('{"question": "What is the program deadline?", "answer": "The deadline is next Monday."}');
    mockFaqCreate.mockResolvedValue({ _id: 'faq_123' });

    await handleMessageReaction(mockReaction as any, mockUser as any, dummyConfig);

    expect(fetchStarterMessageMock).toHaveBeenCalled();
    expect(mockGetPipelineProviderConfig).toHaveBeenCalledWith('auto_answer');
    expect(mockChatWithConfig).toHaveBeenCalled();
    expect(mockFaqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'What is the program deadline?',
        answer: 'The deadline is next Monday.',
        status: 'pending',
        reviewStatus: 'pending_review',
        batchId: expect.any(Types.ObjectId),
      })
    );
    expect(mockReact).toHaveBeenCalledWith('💾');
  });

  it('extracts Q&A and creates pending FAQ when not a thread', async () => {
    const mockReact = vi.fn();
    const mockReaction = {
      emoji: { name: '💡' },
      partial: false,
      message: {
        id: 'msg_98766',
        author: { bot: false },
        content: 'How do I contact support? Email support@example.com',
        channel: {
          isThread: () => false,
        },
        react: mockReact,
      },
    };
    const mockUser = { bot: false, tag: 'reviewer#5678' };

    mockGetPipelineProviderConfig.mockResolvedValue({ provider: 'openai', model: 'gpt-4' });
    mockChatWithConfig.mockResolvedValue('{"question": "How do I contact support?", "answer": "Email support@example.com"}');
    mockFaqCreate.mockResolvedValue({ _id: 'faq_124' });

    await handleMessageReaction(mockReaction as any, mockUser as any, dummyConfig);

    expect(mockGetPipelineProviderConfig).toHaveBeenCalledWith('auto_answer');
    expect(mockChatWithConfig).toHaveBeenCalled();
    expect(mockFaqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'How do I contact support?',
        answer: 'Email support@example.com',
        status: 'pending',
        reviewStatus: 'pending_review',
      })
    );
    expect(mockReact).toHaveBeenCalledWith('💾');
  });

  it('extracts Q&A and fetches referenced message content when reacting to a reply', async () => {
    const mockReact = vi.fn();
    const fetchMessageMock = vi.fn().mockResolvedValue({ content: 'How do I generate API keys?' });
    const mockReaction = {
      emoji: { name: '✅' },
      partial: false,
      message: {
        id: 'msg_98768',
        author: { bot: false },
        content: 'Go to settings -> API and click generate.',
        reference: {
          messageId: 'msg_referenced_123',
        },
        channel: {
          isThread: () => false,
          messages: {
            fetch: fetchMessageMock,
          },
        },
        react: mockReact,
      },
    };
    const mockUser = { bot: false, tag: 'reviewer#5678' };

    mockGetPipelineProviderConfig.mockResolvedValue({ provider: 'openai', model: 'gpt-4' });
    mockChatWithConfig.mockResolvedValue('{"question": "How do I generate API keys?", "answer": "Go to settings -> API and click generate."}');
    mockFaqCreate.mockResolvedValue({ _id: 'faq_125' });

    await handleMessageReaction(mockReaction as any, mockUser as any, dummyConfig);

    expect(fetchMessageMock).toHaveBeenCalledWith('msg_referenced_123');
    expect(mockGetPipelineProviderConfig).toHaveBeenCalledWith('auto_answer');
    expect(mockChatWithConfig).toHaveBeenCalled();
    expect(mockFaqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'How do I generate API keys?',
        answer: 'Go to settings -> API and click generate.',
        status: 'pending',
        reviewStatus: 'pending_review',
      })
    );
    expect(mockReact).toHaveBeenCalledWith('💾');
  });

  it('gracefully handles invalid JSON from AI', async () => {
    const mockReact = vi.fn();
    const mockReaction = {
      emoji: { name: '✅' },
      partial: false,
      message: {
        id: 'msg_98767',
        author: { bot: false },
        content: 'Just check the website.',
        channel: {
          isThread: () => false,
        },
        react: mockReact,
      },
    };
    const mockUser = { bot: false, tag: 'reviewer#5678' };

    mockGetPipelineProviderConfig.mockResolvedValue({ provider: 'openai', model: 'gpt-4' });
    mockChatWithConfig.mockResolvedValue('This is not JSON text.');

    await handleMessageReaction(mockReaction as any, mockUser as any, dummyConfig);

    expect(mockFaqCreate).not.toHaveBeenCalled();
    expect(mockReact).not.toHaveBeenCalled();
  });
});
