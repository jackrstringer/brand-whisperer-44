import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-card animate-shimmer", className)}
      style={{
        background: "linear-gradient(135deg, var(--gray-5) 25%, var(--gray-4) 50%, var(--gray-5) 75%)",
        backgroundSize: "200% 200%",
      }}
      {...props}
    />
  );
}

export { Skeleton };
