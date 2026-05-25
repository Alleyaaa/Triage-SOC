import { ShieldAlert } from "lucide-react";

export function EmptyState({ title, description, action }: { title: string, description: string, action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in zoom-in duration-500">
      <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-6">
        <ShieldAlert className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2 font-mono uppercase">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}