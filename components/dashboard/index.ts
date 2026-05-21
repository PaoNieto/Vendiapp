/** Barrel for premium presentational components compartidos entre dashboard y shell global. */

export { AppBackground } from "./app-background";
export type { AppBackgroundProps } from "./app-background";

/** Alias deprecado — mantenido para no romper imports existentes del dashboard. */
export { DashboardBackground } from "./dashboard-background";
export type { DashboardBackgroundProps } from "./dashboard-background";

export { PillButton } from "./pill-button";
export type { PillButtonProps, PillButtonSize } from "./pill-button";

export { StatusBadge } from "./status-badge";
export type {
  StatusBadgeProps,
  StatusBadgeStatus,
  StatusBadgeSize,
} from "./status-badge";

export { StatRow } from "./stat-row";
export type { StatRowProps } from "./stat-row";

export { GenerationCard } from "./generation-card";
export type { GenerationCardProps, GenerationCardRatio } from "./generation-card";

export { ProductCard } from "./product-card";
export type { ProductCardProps } from "./product-card";

export { ProductSelector } from "./product-selector";
export type {
  ProductSelectorProps,
  ProductSelectorOption,
} from "./product-selector";

export { VersionCard } from "./version-card";
export type { VersionCardProps, VersionCardRatio } from "./version-card";

export { HeroCTAButton } from "./hero-cta-button";
export type { HeroCTAButtonProps } from "./hero-cta-button";

export { VersionDrawer } from "./version-drawer";
export type { VersionDrawerProps } from "./version-drawer";

export { FilterBar } from "./filter-bar";
export type { FilterBarProps, FilterStatus, FilterProduct } from "./filter-bar";
