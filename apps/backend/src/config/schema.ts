import { z } from 'zod';

export const ConfigSchema = z.object({
  server: z.object({
    port: z.number().default(6767),
    env: z.string().default('development'),
    trustProxyHops: z.number().default(1),
    bodyLimit: z.string().default('10mb'),
    shutdownTimeoutMs: z.number().default(15000),
  }),
  cors: z.object({
    allowedOrigins: z.array(z.string()).default([]),
    allowVercelPreviews: z.boolean().default(true),
    allowLocalhostInDev: z.boolean().default(true),
    credentials: z.boolean().default(true),
  }),
  database: z.object({
    connectionTimeoutMs: z.number().default(5000),
    maxPoolSize: z.number().default(10),
    retryAttempts: z.number().default(3),
    retryDelayMs: z.number().default(1000),
  }),
  auth: z.object({
    jwt: z.object({
      expiresIn: z.string().default('7d'),
      issuer: z.string().default('csfaq'),
      audience: z.string().default('csfaq-api'),
    }),
    password: z.object({
      minLength: z.number().default(6),
      maxLength: z.number().default(128),
      bcryptRounds: z.number().default(10),
    }),
    session: z.object({
      revokedTokenTtlDays: z.number().default(7),
    }),
  }),
  rateLimiting: z.object({
    global: z.object({
      windowMs: z.number().default(900000),
      maxRequests: z.number().default(100),
    }),
    auth: z.object({
      loginWindowMs: z.number().default(900000),
      loginMaxAttempts: z.number().default(5),
      registerWindowMs: z.number().default(3600000),
      registerMaxAttempts: z.number().default(3),
    }),
    search: z.object({
      windowMs: z.number().default(60000),
      maxRequests: z.number().default(30),
    }),
    askAi: z.object({
      windowMs: z.number().default(86400000),
      anonymousMax: z.number().default(5),
      authenticatedMax: z.number().default(50),
    }),
    upload: z.object({
      windowMs: z.number().default(3600000),
      maxRequests: z.number().default(20),
    }),
  }),
  search: z.object({
    hybrid: z.object({
      vectorWeight: z.number().default(0.6),
      keywordWeight: z.number().default(0.4),
      rrfK: z.number().default(60),
      maxResults: z.number().default(20),
      minScore: z.number().default(0.3),
    }),
    embedding: z.object({
      model: z.string().default('mixedbread-ai/mxbai-embed-large-v1'),
      dimensions: z.number().default(1024),
      queryPrefix: z.string().default(''),
      batchSize: z.number().default(32),
      warmupOnStart: z.boolean().default(true),
    }),
    trending: z.object({
      windowDays: z.number().default(7),
      maxResults: z.number().default(10),
    }),
    suggest: z.object({
      maxResults: z.number().default(5),
      minQueryLength: z.number().default(2),
    }),
    log: z.object({
      bufferSize: z.number().default(50),
      flushIntervalMs: z.number().default(30000),
    }),
  }),
  faq: z.object({
    maxTitleLength: z.number().default(200),
    maxAnswerLength: z.number().default(10000),
    freshness: z.object({
      tiers: z.object({
        evergreen: z.object({ reviewIntervalDays: z.number() }),
        seasonal: z.object({ reviewIntervalDays: z.number() }),
        volatile: z.object({ reviewIntervalDays: z.number() }),
      }),
      peerVoteThreshold: z.number().default(3),
      escalationDays: z.number().default(3),
      cronSchedule: z.string().default('0 6 * * *'),
    }),
    duplicateDetection: z.object({
      similarityThreshold: z.number().default(0.85),
      maxCandidates: z.number().default(5),
    }),
  }),
  community: z.object({
    post: z.object({
      titleMinLength: z.number().default(5),
      titleMaxLength: z.number().default(200),
      bodyMaxLength: z.number().default(5000),
    }),
    comment: z.object({
      maxLength: z.number().default(2000),
      maxDepth: z.number().default(5),
    }),
    escalation: z.object({
      checkIntervalMs: z.number().default(3600000),
      autoEscalateAfterHours: z.number().default(48),
    }),
  }),
  support: z.object({
    goldenTicket: z.object({
      defaultCooldownHours: z.number().default(48),
      maxCooldownHours: z.number().default(720),
      spCostPerEscalation: z.number().default(10),
    }),
    troubleshoot: z.object({
      maxSteps: z.number().default(4),
      evidenceMaxFiles: z.number().default(5),
    }),
    ticket: z.object({
      maxFollowUps: z.number().default(20),
      autoCloseAfterDays: z.number().default(14),
    }),
  }),
  ai: z.object({
    providers: z.object({
      priority: z.array(z.string()).default([]),
    }),
    pipelines: z.object({
      autoAnswer: z.object({
        approveThreshold: z.number().default(0.85),
        queueThreshold: z.number().default(0.60),
        minConfidence: z.number().default(0.35),
        scheduleCron: z.string().default('0 */6 * * *'),
        maxBatchSize: z.number().default(50),
      }),
      faqAudit: z.object({
        scheduleCron: z.string().default('0 2 * * *'),
        maxBatchSize: z.number().default(100),
      }),
      duplicateDetection: z.object({
        similarityThreshold: z.number().default(0.80),
      }),
      zoomExtraction: z.object({
        minTranscriptLength: z.number().default(100),
        maxQuestionsPerMeeting: z.number().default(20),
      }),
    }),
    pipelineResult: z.object({
      ttlDays: z.number().default(30),
    }),
  }),
  zoom: z.object({
    oauth: z.object({
      tokenCacheTtlMs: z.number().default(300000),
      circuitBreaker: z.object({
        failureThreshold: z.number().default(5),
        resetTimeMs: z.number().default(60000),
      }),
    }),
    webhook: z.object({
      verifySignature: z.boolean().default(true),
    }),
    retry: z.object({
      maxAttempts: z.number().default(3),
      intervalMs: z.number().default(300000),
      backoffMultiplier: z.number().default(2),
    }),
    topicBlacklist: z.array(z.string()).default([]),
  }),
  documents: z.object({
    queue: z.object({
      enabled: z.boolean().default(false),
      concurrency: z.number().default(3),
    }),
    autoPromote: z.object({
      intervalMs: z.number().default(900000),
      minScore: z.number().default(0.7),
    }),
    extraction: z.object({
      maxFileSizeMb: z.number().default(50),
      supportedFormats: z.array(z.string()).default([]),
    }),
  }),
  notifications: z.object({
    dispatch: z.object({
      batchSize: z.number().default(100),
      retryAttempts: z.number().default(3),
    }),
    cleanup: z.object({
      retentionDays: z.number().default(90),
    }),
  }),
  moderation: z.object({
    profanityFilter: z.object({
      enabled: z.boolean().default(true),
      strategy: z.string().default('asterisk'),
    }),
    contentLimits: z.object({
      maxReportsBeforeAutoFlag: z.number().default(3),
    }),
  }),
  reputation: z.object({
    points: z.object({
      postCreate: z.number().default(5),
      commentCreate: z.number().default(2),
      answerAccepted: z.number().default(15),
      upvoteReceived: z.number().default(1),
      downvoteReceived: z.number().default(-1),
      faqContribution: z.number().default(10),
    }),
    tiers: z.object({
      newcomer: z.number().default(0),
      contributor: z.number().default(50),
      expert: z.number().default(200),
      mentor: z.number().default(500),
      knowledge_master: z.number().default(1000),
    }),
    promotion: z.object({
      checkIntervalMs: z.number().default(900000),
    }),
  }),
  cron: z.object({
    timezone: z.string().default('UTC'),
    promotionCycleIntervalMs: z.number().default(900000),
    freshnessCheckIntervalMs: z.number().default(86400000),
    categoryClusterIntervalMs: z.number().default(86400000),
    popularityRecomputeIntervalMs: z.number().default(300000),
    retentionPolicyIntervalMs: z.number().default(86400000),
    zoomRetryIntervalMs: z.number().default(300000),
    searchLogFlushIntervalMs: z.number().default(30000),
  }),
  retention: z.object({
    searchLogs: z.object({ ttlDays: z.number().default(90) }),
    notifications: z.object({ ttlDays: z.number().default(90) }),
    freshReviewLogs: z.object({ ttlDays: z.number().default(180) }),
    moderationLogs: z.object({ ttlDays: z.number().default(365) }),
    adminLogs: z.object({ ttlDays: z.number().default(365) }),
    pipelineResults: z.object({ ttlDays: z.number().default(30) }),
  }),
  observability: z.object({
    sentry: z.object({
      enabled: z.boolean().default(true),
      tracesSampleRate: z.number().default(0.1),
    }),
    logging: z.object({
      level: z.string().default('info'),
      colorize: z.boolean().default(true),
      discord: z.object({
        enabled: z.boolean().default(false),
        alertLevels: z.array(z.string()).default([]),
      }),
    }),
    metrics: z.object({
      enabled: z.boolean().default(true),
      endpoint: z.string().default('/csfaq/api/metrics'),
    }),
  }),
  cloudinary: z.object({
    folder: z.string().default('yaksha'),
    allowedFormats: z.array(z.string()).default([]),
    maxFileSizeMb: z.number().default(10),
  }),
  // v1.71 — Image uploads now go to GCS instead of Cloudinary.
  // The Cloudinary block above stays until all DB rows are migrated
  // and the legacy code is removed (see Cloudinary-to-GCS migration plan).
  gcs: z.object({
    bucket: z.string().default(''),
    publicHost: z.string().default(''),
    allowedSubfolders: z.array(z.string()).default(['avatar', 'posts']),
    maxFileSizeMb: z.number().default(8),
    signedUrlTtlSeconds: z.number().default(900),
  }),
  programs: z.object({
    maxBatchesPerProgram: z.number().default(50),
    maxCoursesPerBatch: z.number().default(20),
    defaultTheme: z.object({
      primaryColor: z.string().default('#4A7C59'),
      accentColor: z.string().default('#F4A261'),
    }),
  }),
  featureFlags: z.object({
    defaults: z.object({
      sessionSupport: z.boolean().default(true),
      goldenTicket: z.boolean().default(true),
      communityDuplicateDetection: z.boolean().default(true),
      aiAutoAnswer: z.boolean().default(true),
      faqFreshness: z.boolean().default(true),
      publicFaqPage: z.boolean().default(true),
      documentPipeline: z.boolean().default(false),
      discordIntegration: z.boolean().default(false),
    }),
  }),
  redis: z.object({
    url: z.string().default(''),
    token: z.string().default(''),
    tcpUrl: z.string().default(''),
  }).default({
    url: '',
    token: '',
    tcpUrl: '',
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
