import type { ReactNode } from 'react';

export type IconProps = {
  size?: number;
  className?: string;
};

type IconBaseProps = IconProps & { children: ReactNode };

function IconBase({ size = 18, className, children }: IconBaseProps) {
  return (
    <svg
      className={className ? `tia-icon ${className}` : 'tia-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10.5" cy="10.5" r="6.25" />
      <path d="m15 15 5 5" />
    </IconBase>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </IconBase>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m5 12.5 5 5 9-10" />
    </IconBase>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14M5 12h14" />
    </IconBase>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9 5 7 7-7 7" />
    </IconBase>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m15 5-7 7 7 7" />
    </IconBase>
  );
}

export function StoreIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 9.5 5.5 4.5h13L20 9.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </IconBase>
  );
}

export function CompareIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="5" width="7" height="14" rx="1.5" />
      <rect x="13.5" y="5" width="7" height="14" rx="1.5" />
    </IconBase>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.5V12l3.5 2" />
    </IconBase>
  );
}

export function CreditCardIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="6" width="18" height="12.5" rx="2.5" />
      <path d="M3 10h18M7 14.5h4" />
    </IconBase>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 21c4.5-5 7-8.2 7-11.5a7 7 0 1 0-14 0C5 12.8 7.5 16 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </IconBase>
  );
}

export function CrosshairIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="6.75" />
      <path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </IconBase>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3.5 22 20H2Z" />
      <path d="M12 9v5.5" />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8.5 7 10 4.5h4L15.5 7" />
      <rect x="3" y="7" width="18" height="12.5" rx="3" />
      <circle cx="12" cy="13.2" r="3.6" />
    </IconBase>
  );
}

export function BatteryIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2.5" y="8" width="16" height="8.5" rx="2" />
      <path d="M21.5 10.5v3.5" />
      <rect x="5.5" y="10.5" width="7" height="3.5" rx="1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3.5 13.6 8.4 18.5 10l-4.9 1.6L12 16.5l-1.6-4.9L5.5 10l4.9-1.6Z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z" />
    </IconBase>
  );
}

export function StopCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" />
    </IconBase>
  );
}

export function RestartIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </IconBase>
  );
}
