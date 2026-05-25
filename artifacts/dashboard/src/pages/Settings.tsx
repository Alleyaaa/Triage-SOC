import { useGetN8nConfig, getGetN8nConfigQueryKey, useUpdateN8nConfig } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Webhook } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState("");

  const { data: config, isLoading } = useGetN8nConfig({ query: { queryKey: getGetN8nConfigQueryKey() } });

  useEffect(() => {
    if (config?.webhookUrl) {
      setWebhookUrl(config.webhookUrl);
    }
  }, [config]);

  const updateMutation = useUpdateN8nConfig({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetN8nConfigQueryKey() });
        toast({
          title: "Configuration Saved",
          description: "SOAR integration settings have been updated.",
        });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to save configuration.",
        });
      }
    }
  });

  const handleSave = () => {
    updateMutation.mutate({ data: { webhookUrl } });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-mono uppercase">Settings</h1>
        <p className="text-muted-foreground">Configure system integrations and workspace preferences.</p>
      </div>

      <Card className="bg-card border-card-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            n8n SOAR Integration
          </CardTitle>
          <CardDescription>
            Configure the webhook URL used to trigger automated incident response workflows when an AI report is generated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="webhookUrl">Webhook URL</Label>
              <Input
                id="webhookUrl"
                placeholder="https://n8n.yourdomain.com/webhook/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          )}

          <div className="flex items-center gap-2 p-4 rounded-md border border-border bg-muted/20">
            {isLoading ? (
              <Skeleton className="h-5 w-32" />
            ) : config?.isConfigured ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">Integration Active</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Integration Not Configured</span>
              </>
            )}
          </div>
        </CardContent>
        <CardFooter className="border-t border-border px-6 py-4">
          <Button 
            onClick={handleSave} 
            disabled={updateMutation.isPending || !webhookUrl}
          >
            {updateMutation.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}