import type { LucideIcon } from "lucide-react";
import { OctagonAlert, TriangleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// Panel building blocks in the Haulix style: rounded cards with an icon title
// and optional round action, pill stat chips, and severity pills.

export function PanelCard({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
  children,
}: {
  icon?: LucideIcon;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned control, e.g. a <RoundButton>. */
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4 text-card-foreground",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h3 className="flex items-center gap-2 font-medium">
                {Icon && (
                  <Icon aria-hidden className="size-4 shrink-0 opacity-80" />
                )}
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Circular ghost icon button (refresh, expand…). */
export function RoundButton({
  label,
  icon: Icon,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Icon className="size-4" />
    </button>
  );
}

/** Stat chip: "Label value" in a pill, e.g. "Class D". */
export function StatChip({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon?: LucideIcon;
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs",
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-3.5 text-muted-foreground" />}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium figures">{value}</span>
    </span>
  );
}

export type Severity = "high" | "warning" | "info";

export const SEVERITY_STYLE: Record<
  Severity,
  { icon: LucideIcon; pill: string; row: string }
> = {
  high: {
    icon: OctagonAlert,
    pill: "bg-destructive/15 text-destructive",
    row: "border-l-destructive bg-linear-to-r from-destructive/15 to-transparent",
  },
  warning: {
    icon: TriangleAlert,
    pill: "bg-warning/15 text-warning",
    row: "border-l-warning bg-linear-to-r from-warning/12 to-transparent",
  },
  info: {
    icon: Info,
    pill: "bg-secondary text-muted-foreground",
    row: "border-l-muted-foreground/40 bg-secondary/40",
  },
};

export function SeverityPill({
  severity,
  children,
}: {
  severity: Severity;
  children: React.ReactNode;
}) {
  const { icon: Icon, pill } = SEVERITY_STYLE[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        pill,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {children}
    </span>
  );
}
