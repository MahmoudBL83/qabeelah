import QabeelaLogo from './QabeelaLogo';

interface BrandMarkProps {
  className?: string;
}

export default function BrandMark({ className = 'h-24 w-24' }: BrandMarkProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} aria-hidden>
      <QabeelaLogo size="medium" />
    </div>
  );
}