import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border border-primary/20 bg-primary/10 text-primary",
        secondary:
          "border border-border/80 bg-secondary/60 text-secondary-foreground",
        destructive:
          "border border-destructive/20 bg-destructive/10 text-rose-400",
        outline:
          "border border-border bg-transparent text-muted-foreground",
        success:
          "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        warning:
          "border border-amber-500/20 bg-amber-500/10 text-amber-400",
        purple:
          "border border-violet-500/20 bg-violet-500/10 text-violet-400",
        blue:
          "border border-sky-500/20 bg-sky-500/10 text-sky-400",
        zinc:
          "border border-zinc-700 bg-zinc-800/60 text-zinc-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
