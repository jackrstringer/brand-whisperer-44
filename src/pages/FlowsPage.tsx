import { GitBranch } from 'lucide-react';

export default function FlowsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
        <GitBranch className="w-8 h-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">Flows</h1>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        Automated email flows are coming soon. You'll be able to design welcome series, abandoned cart sequences, post-purchase flows, and more.
      </p>
      <span className="text-xs font-medium text-primary bg-primary/10 px-3 py-1.5 rounded-full">
        Coming Soon
      </span>
    </div>
  );
}
