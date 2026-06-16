import { useTheme } from "@/hooks/use-theme";

interface LogoProps {
  dark?: boolean;      // kept for backward-compat; theme is now auto-detected
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Logo({ size = 'md', className = '' }: LogoProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const iconSrc  = isDark ? '/assets/app-icon-dark-48x48.png'  : '/assets/app-icon-light-48x48.png';
  const titleSrc = isDark ? '/assets/app-title-dark.png'       : '/assets/app-title-light.png';

  const iconH = { sm: 26, md: 34, lg: 46 }[size];

  const containerH = iconH;
  const titleH = iconH - 8;

  return (
    <div
      className={`flex items-center gap-2 flex-shrink-0 overflow-hidden ${className}`}
      style={{ height: containerH, maxWidth: 160 }}
    >
      <img
        src={iconSrc}
        alt=""
        width={containerH}
        height={containerH}
        style={{ objectFit: 'contain', display: 'block', flexShrink: 0 }}
      />
      <img
        src={titleSrc}
        alt="ScanItKnowIt"
        height={titleH}
        style={{ objectFit: 'contain', display: 'block', width: 'auto', maxWidth: '100%', maxHeight: titleH }}
      />
    </div>
  );
}
