import { type FC } from 'react';

type LogoVariant = 'default' | 'dark' | 'mark-only' | 'wordmark-only';
type LogoSize = 'sm' | 'md' | 'lg';

interface LexSentinelLogoProps {
  size?: LogoSize;
  variant?: 'full' | 'icon';
  // Extended Olimey variant support
  logoVariant?: LogoVariant;
  /** Pixel size of the mark when using logoVariant. Default derived from size. */
  pixelSize?: number;
  className?: string;
}

const sizeMap: Record<LogoSize, number> = { sm: 24, md: 32, lg: 42 };

const OlimeyLogo: FC<LexSentinelLogoProps> = ({
  size = 'md',
  variant = 'full',
  logoVariant = 'default',
  pixelSize,
  className = '',
}) => {
  const isDark = logoVariant === 'dark';
  const ringColor = isDark ? '#F4EDE0' : '#0A1628';
  const textColor = isDark ? '#F4EDE0' : '#0A1628';
  const px = pixelSize ?? sizeMap[size];

  const mark = (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <path
        d="M 33.9 15.6 A 38 38 0 1 0 84.4 33.9"
        stroke={ringColor}
        strokeWidth="4"
      />
      <path
        d="M 84.4 33.9 A 38 38 0 0 0 33.9 15.6"
        stroke="#E8A33D"
        strokeWidth="5"
      />
    </svg>
  );

  const wordmark = (
    <span
      className="font-medium tracking-tight leading-none"
      style={{
        fontSize: `${px * 0.75}px`,
        color: textColor,
        fontFamily: 'Inter, -apple-system, "Helvetica Neue", Arial, sans-serif',
        letterSpacing: '-0.025em',
      }}
    >
      olimey
    </span>
  );

  const showWord = variant === 'full' && logoVariant !== 'mark-only';

  if (!showWord) {
    return (
      <span className={className} role="img" aria-label="Olimey">
        {mark}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      role="img"
      aria-label="Olimey"
    >
      {mark}
      {wordmark}
    </span>
  );
};

export default OlimeyLogo;
