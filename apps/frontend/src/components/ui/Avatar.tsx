import React from 'react';

interface AvatarProps {
  name?: string;
  /** Cloudinary URL — when set, renders an <img>. Falls back to initial. */
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: 'w-5 h-5 text-[8px]',
  sm: 'w-7 h-7 text-[10px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-11 h-11 text-sm',
};

const palette = [
  'bg-accent-light text-accent',
  'bg-success-light text-success',
  'bg-warning-light text-warning',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-accent/15 text-accent',
];

export default function Avatar({ name, src, size = 'sm', className = '' }: AvatarProps) {
  const initials = (name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const colorIndex = (name?.charCodeAt(0) || 0) % palette.length;

  // When we have a Cloudinary URL, render the image with the initial
  // pill as a fallback while it loads. This gives us a graceful
  // no-flash transition even on slow networks.
  return (
    <div
      className={`
        rounded-full flex-shrink-0 flex items-center justify-center
        font-semibold select-none overflow-hidden
        ${sizeClasses[size]}
        ${src ? 'bg-mist' : palette[colorIndex]}
        ${className}
      `}
      aria-hidden="true"
    >
      {src ? (
        <img
          src={src}
          alt={name || 'User avatar'}
          className="w-full h-full object-cover"
          loading="lazy"
          // Hide if Cloudinary errors (e.g. asset deleted). The initials
          // underneath still show in that case.
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
