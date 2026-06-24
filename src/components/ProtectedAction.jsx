import React from 'react';
import { useRequireAuth } from '../hooks/useRequireAuth';

/**
 * ProtectedAction – declarative auth guard wrapper
 *
 * Usage:
 *   <ProtectedAction onAction={() => likeFAQ(id)}>
 *     <button>Like</button>
 *   </ProtectedAction>
 *
 * Wraps children in a click handler that gates through auth.
 */
export default function ProtectedAction({ children, onAction, className = '' }) {
  const guard = useRequireAuth();

  const handleClick = (e) => {
    e.stopPropagation();
    guard(onAction);
  };

  return (
    <div onClick={handleClick} className={className} role="button" tabIndex={0}>
      {children}
    </div>
  );
}
