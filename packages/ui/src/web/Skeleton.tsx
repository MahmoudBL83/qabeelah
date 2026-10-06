interface SkeletonProps {
  className?: string;
  'aria-label'?: string;
}

export default function Skeleton({ className = '', 'aria-label': ariaLabel = 'loading' }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className={`bg-surface-variant/30 animate-pulse ${className}`}
    />
  );
}
