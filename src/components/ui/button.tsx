import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-brand text-on-brand hover:bg-brand-strong",
        outline:
          "border border-border bg-surface text-text hover:bg-surface-sunken",
        ghost: "text-text hover:bg-surface-sunken",
        destructive: "bg-high text-on-brand hover:opacity-90",
      },
      // TASK-49 DES-008: on touch layouts (below md) every size is a 44px
      // target, the project's touch goal (WCAG 2.2 SC 2.5.8 needs 24px).
      // Desktop sizes are unchanged.
      size: {
        default: "h-9 px-4 py-2 max-md:h-11",
        sm: "h-8 rounded-md px-3 text-xs max-md:h-11",
        lg: "h-10 rounded-md px-6 max-md:h-11",
        icon: "size-9 max-md:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
