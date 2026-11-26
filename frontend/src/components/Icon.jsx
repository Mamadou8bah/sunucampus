import { iconPaths } from './iconPaths.js';

/* 24px stroke icons, drawn for SunuCampus. Decorative by default; pass `label` to announce one. */
export default function Icon({ name, size = 24, label, className, strokeWidth = 1.8 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {iconPaths[name]?.map(([Shape, props], index) => <Shape key={index} {...props} />)}
    </svg>
  );
}
