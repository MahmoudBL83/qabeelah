interface PatternProps {
  className?: string;
  opacity?: number;
}

/**
 * Diamond and line pattern - warm brown with dark brown diamonds
 */
export function PatternDiamondLines({ className = '', opacity = 1 }: PatternProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={{ opacity }}
    >
  
      <g fill="#16130E">
        <rect x="0" y="20" width="200" height="2" />
        <rect x="0" y="60" width="200" height="2" />
        <rect x="0" y="100" width="200" height="2" />
        <rect x="0" y="140" width="200" height="2" />
        <rect x="0" y="180" width="200" height="2" />
        {/* diamonds on alternating rows */}
        <rect x="20" y="36" width="10" height="10" transform="rotate(45 25 41)" />
        <rect x="60" y="36" width="10" height="10" transform="rotate(45 65 41)" />
        <rect x="100" y="36" width="10" height="10" transform="rotate(45 105 41)" />
        <rect x="140" y="36" width="10" height="10" transform="rotate(45 145 41)" />
        <rect x="180" y="36" width="10" height="10" transform="rotate(45 185 41)" />

        <rect x="0" y="116" width="10" height="10" transform="rotate(45 5 121)" />
        <rect x="40" y="116" width="10" height="10" transform="rotate(45 45 121)" />
        <rect x="80" y="116" width="10" height="10" transform="rotate(45 85 121)" />
        <rect x="120" y="116" width="10" height="10" transform="rotate(45 125 121)" />
        <rect x="160" y="116" width="10" height="10" transform="rotate(45 165 121)" />
      </g>
    </svg>
  );
}

/**
 * Diamond grid pattern - light cream with subtle lines and centered brown diamond
 */
export function PatternDiamondGrid({ className = '', opacity = 1 }: PatternProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={{ opacity }}
    >
      <rect width="200" height="200" fill="#F2EADA" />
      {/* thin lines forming diamond grid */}
      <g stroke="#16130E" strokeWidth="0.6" opacity="0.25" fill="none">
        <path d="M0 50 L50 0 L100 50 L50 100 Z" />
        <path d="M100 50 L150 0 L200 50 L150 100 Z" />
        <path d="M0 150 L50 100 L100 150 L50 200 Z" />
        <path d="M100 150 L150 100 L200 150 L150 200 Z" />
      </g>
      <g fill="#B58543">
        <rect x="44" y="44" width="12" height="12" transform="rotate(45 50 50)" />
        <rect x="144" y="44" width="12" height="12" transform="rotate(45 150 50)" />
        <rect x="44" y="144" width="12" height="12" transform="rotate(45 50 150)" />
        <rect x="144" y="144" width="12" height="12" transform="rotate(45 150 150)" />
        <rect x="94" y="94" width="14" height="14" transform="rotate(45 101 101)" fill="#16130E" />
      </g>
    </svg>
  );
}

/**
 * Repeating diamond pattern - dark background with repeating brown diamonds
 */
export function PatternDiamondRepeat({ className = '', opacity = 1 }: PatternProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={{ opacity }}
    >
     
      <g fill="#B58543">
        <g>
          <rect x="14" y="14" width="12" height="12" transform="rotate(45 20 20)" />
          <rect x="44" y="14" width="12" height="12" transform="rotate(45 50 20)" />
          <rect x="74" y="14" width="12" height="12" transform="rotate(45 80 20)" />
          <rect x="104" y="14" width="12" height="12" transform="rotate(45 110 20)" />
          <rect x="134" y="14" width="12" height="12" transform="rotate(45 140 20)" />
          <rect x="164" y="14" width="12" height="12" transform="rotate(45 170 20)" />
        </g>
        <g>
          <rect x="14" y="44" width="12" height="12" transform="rotate(45 20 50)" />
          <rect x="44" y="44" width="12" height="12" transform="rotate(45 50 50)" />
          <rect x="74" y="44" width="12" height="12" transform="rotate(45 80 50)" />
          <rect x="104" y="44" width="12" height="12" transform="rotate(45 110 50)" />
          <rect x="134" y="44" width="12" height="12" transform="rotate(45 140 50)" />
          <rect x="164" y="44" width="12" height="12" transform="rotate(45 170 50)" />
        </g>
        <g>
          <rect x="14" y="74" width="12" height="12" transform="rotate(45 20 80)" />
          <rect x="44" y="74" width="12" height="12" transform="rotate(45 50 80)" />
          <rect x="74" y="74" width="12" height="12" transform="rotate(45 80 80)" />
          <rect x="104" y="74" width="12" height="12" transform="rotate(45 110 80)" />
          <rect x="134" y="74" width="12" height="12" transform="rotate(45 140 80)" />
          <rect x="164" y="74" width="12" height="12" transform="rotate(45 170 80)" />
        </g>
        <g>
          <rect x="14" y="104" width="12" height="12" transform="rotate(45 20 110)" />
          <rect x="44" y="104" width="12" height="12" transform="rotate(45 50 110)" />
          <rect x="74" y="104" width="12" height="12" transform="rotate(45 80 110)" />
          <rect x="104" y="104" width="12" height="12" transform="rotate(45 110 110)" />
          <rect x="134" y="104" width="12" height="12" transform="rotate(45 140 110)" />
          <rect x="164" y="104" width="12" height="12" transform="rotate(45 170 110)" />
        </g>
        <g>
          <rect x="14" y="134" width="12" height="12" transform="rotate(45 20 140)" />
          <rect x="44" y="134" width="12" height="12" transform="rotate(45 50 140)" />
          <rect x="74" y="134" width="12" height="12" transform="rotate(45 80 140)" />
          <rect x="104" y="134" width="12" height="12" transform="rotate(45 110 140)" />
          <rect x="134" y="134" width="12" height="12" transform="rotate(45 140 140)" />
          <rect x="164" y="134" width="12" height="12" transform="rotate(45 170 140)" />
        </g>
      </g>
    </svg>
  );
}
