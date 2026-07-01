import React from 'react';
import { motion } from 'framer-motion';
import { useFeatureFlag } from '../../context/FeatureFlagContext';
import { useAuth } from '../../hooks/useAuth';
import Spinner from '../ui/Spinner';

export function FeatureDisabledPanel({ feature }: { feature: string }): React.ReactElement {
  const { user } = useAuth();
  const showAdminLink = user?.role === 'admin' || user?.role === 'moderator';

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full text-center p-8 sm:p-10 rounded-3xl border border-border bg-card/65 backdrop-blur-xl shadow-2xl relative overflow-hidden"
      >
        {/* Abstract glowing ambient blobs */}
        <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-accent/8 blur-[50px] pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-warning/8 blur-[50px] pointer-events-none" />

        {/* Premium Icon Container with animated pulsing ring */}
        <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-accent/20 to-warning/20 text-accent mb-6 shadow-md border border-accent/20">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        {/* Title */}
        <h2 className="font-serif text-2xl font-bold tracking-tight text-ink">
          Feature Unavailable
        </h2>
        
        {/* Feature Specific Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-3 mb-4 rounded-full bg-mist border border-border text-ink-soft text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-warning/80" />
          {feature}
        </div>

        {/* Description */}
        <p className="text-sm text-ink-soft leading-relaxed mb-6">
          This feature is currently deactivated. If this is unexpected, you can enable it instantly in the system console.
        </p>

        {showAdminLink && (
        <div className="p-4 rounded-2xl bg-mist/50 border border-border/50 text-xs text-ink-soft flex items-center justify-center gap-2">
          <span>Enable at</span>
          <a 
            href="/csfaq/admin/features" 
            className="font-mono px-2 py-1 rounded bg-cream hover:bg-accent/15 text-accent hover:text-accent-hover font-semibold transition-colors duration-200"
          >
            /admin/features
          </a>
        </div>
        )}
      </motion.div>
    </div>
  );
}

/** Page-level guard. Wrap a page's content; shows the disabled panel
 *  when the named feature is off. Use `loadingFallback` to render a
 *  spinner while the flag list is still loading. */
export function FeatureGate({
  featureKey,
  children,
  featureLabel,
  loadingFallback,
  requiredRoles,
}: {
  featureKey: string;
  featureLabel: string;
  children: React.ReactNode;
  loadingFallback?: React.ReactNode;
  requiredRoles?: string[];
}): React.ReactElement {
  const { user } = useAuth();
  const enabled = useFeatureFlag(featureKey);
  if (enabled === undefined) {
    return (
      <>{loadingFallback ?? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <Spinner size="md" />
        </div>
      )}</>
    );
  }
  if (enabled === null) {
    // Flag key not found in map — the flag does not exist in the system.
    // Render the unavailable panel so admins notice the misconfiguration.
    return <FeatureDisabledPanel feature={featureLabel} />;
  }
  if (!enabled) {
    return <FeatureDisabledPanel feature={featureLabel} />;
  }
  if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(user?.role ?? '')) {
    return <FeatureDisabledPanel feature={featureLabel} />;
  }
  return <>{children}</>;
}
