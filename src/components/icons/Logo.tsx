import { useId } from "react";
import { cn } from "@/lib/utils";

interface LogoProps extends React.ComponentProps<"svg"> {
  /** Render with the brand gradient fill. Set to false to inherit `currentColor` instead. */
  gradient?: boolean;
}

/**
 * KCG Router mark: one continuous route line tracing a cat-head
 * silhouette — up the left cheek, across the ears, down the right
 * cheek, and around the chin — with waypoint nodes along the path.
 * Two inner nodes double as the cat's eyes, so the shape reads as
 * "cat" and "route" at once without drawing a literal face.
 */
export function Logo({ className, gradient = true, ...props }: LogoProps) {
  const gradientId = useId();
  const color = gradient ? `url(#${gradientId})` : "currentColor";

  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("size-6", className)}
      role="img"
      aria-label="KCG Router"
      {...props}
    >
      {gradient ? (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6D5CFB" />
            <stop offset="1" stopColor="#4C3FD9" />
          </linearGradient>
        </defs>
      ) : null}

      {/* one continuous route line tracing the cat-head silhouette */}
      <path
        d="
          M 14 74
          L 14 44
          C 14 36 16 29 20 23
          L 31 9
          L 39 24
          C 42.5 22.8 46.2 22 50 22
          C 53.8 22 57.5 22.8 61 24
          L 69 9
          L 80 23
          C 84 29 86 36 86 44
          L 86 62
          C 86 76 76 86 62 86
          L 38 86
          C 27 86 19 81 16 74
        "
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* route nodes: origin point, two waypoint "eyes", terminal node */}
      <circle cx="14" cy="74" r="7" fill={color} />
      <circle cx="34" cy="52" r="6" fill={color} />
      <circle cx="66" cy="52" r="6" fill={color} />
      <circle cx="50" cy="86" r="7" fill={color} />
    </svg>
  );
}
