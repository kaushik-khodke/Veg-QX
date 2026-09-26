"use client";

import Image from "next/image";

interface CommodityIconProps {
  icon: string;
  sticker?: string;
  label?: string;
  /** Size in pixels — applies to both emoji font-size and sticker image dimensions */
  size?: number;
  className?: string;
}

/**
 * Renders a commodity icon as either a high-quality sticker image (if available)
 * or falls back to the emoji text glyph.
 *
 * Used across all pages for consistent commodity visual representation.
 */
export function CommodityIcon({
  icon,
  sticker,
  label,
  size = 16,
  className = "",
}: CommodityIconProps) {
  if (sticker) {
    return (
      <Image
        src={sticker}
        alt={label || "commodity"}
        width={size}
        height={size}
        className={`inline-block object-contain rounded-sm ${className}`}
        style={{ width: size, height: size }}
        unoptimized
      />
    );
  }

  return (
    <span
      className={`leading-none ${className}`}
      style={{ fontSize: size * 0.85 }}
      role="img"
      aria-label={label}
    >
      {icon}
    </span>
  );
}
