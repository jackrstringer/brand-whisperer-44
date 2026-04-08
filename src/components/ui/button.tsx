import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-opacity transition-transform duration-150 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground rounded-pill hover:opacity-85 hover:-translate-y-px",
        destructive: "bg-primary text-primary-foreground rounded-pill hover:opacity-85",
        outline: "border border-border bg-transparent text-gray-1 rounded-pill hover:border-black hover:text-black",
        secondary: "bg-secondary text-secondary-foreground rounded-pill hover:opacity-85",
        ghost: "hover:bg-gray-5 hover:text-black rounded-pill",
        link: "text-black underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-6 py-2.5 text-sm font-medium",
        sm: "h-9 px-4 text-[13px] font-medium",
        lg: "h-11 px-8 text-sm font-medium",
        icon: "h-10 w-10 rounded-pill",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
