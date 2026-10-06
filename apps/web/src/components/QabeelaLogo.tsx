interface QabeelaLogoProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export default function QabeelaLogo({ size = 'medium', className = '' }: QabeelaLogoProps) {
  const sizes = {
    small: 'w-12 h-12',
    medium: 'w-24 h-24',
    large: 'w-48 h-48',
  };

  return (
    <svg
      viewBox="0 0 1000 360"
      aria-label="Qabeela wordmark"
      className={`${sizes[size]} ${className}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Load Reem Kufi for the logo text only */}
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Reem+Kufi&display=swap');"}</style>
      <g>
        {/* Diamond cluster */}
        <g className="diamond">
          <rect x="688" y="22" width="22" height="22" transform="rotate(45 699 33)" fill="currentColor" />
          <rect x="730" y="22" width="22" height="22" transform="rotate(45 741 33)" fill="currentColor" />
          <rect x="226" y="22" width="22" height="22" transform="rotate(45 237 33)" fill="currentColor" />
          <rect x="268" y="22" width="22" height="22" transform="rotate(45 279 33)" fill="currentColor" />
        </g>
        
        {/* Main text */}
        <text
          x="500"
          y="225"
          textAnchor="middle"
          className="word-mark"
          fontSize="280"
          fontWeight="700"
          fill="currentColor"
          fontFamily={"'Reem Kufi', sans-serif"}
        >
          قبيلة
        </text>
        
        {/* Bottom diamonds */}
        <g className="diamond">
          <rect x="546" y="248" width="22" height="22" transform="rotate(45 557 259)" fill="currentColor" />
          <rect x="430" y="248" width="22" height="22" transform="rotate(45 441 259)" fill="currentColor" />
          <rect x="470" y="248" width="22" height="22" transform="rotate(45 481 259)" fill="currentColor" />
        </g>
        
        {/* English text */}
        <text
          x="500"
          y="315"
          textAnchor="middle"
          className="word-mark-en"
          fontSize="22"
          letterSpacing="14"
          fill="currentColor"
        >
          QABEELA
        </text>
        
        {/* Divider line */}
        <line x1="380" y1="338" x2="620" y2="338" stroke="currentColor" strokeWidth="1" opacity="0.2" />
      </g>
    </svg>
  );
}
