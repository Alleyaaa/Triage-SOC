import { useListSessions, getListSessionsQueryKey, useCreateSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/badges";
import { Plus, Search, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";

export default function Sessions() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  
  const createSessionMutation = useCreateSession({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        setIsDialogOpen(false);
        setNewTitle("");
        setLocation(`/sessions/${data.id}`);
      }
    }
  });

  const filteredSessions = sessions?.filter(s => 
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.id.toString().includes(search)
  ) || [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 flex flex-col h-full">
      <div className="flex justify-between items-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-mono uppercase">Triage Sessions</h1>
          <p className="text-muted-foreground">Manage ongoing and completed investigations.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Investigation Session</DialogTitle>
              <DialogDescription>Start a new triage session to correlate logs.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Session Title</Label>
                <Input id="title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Suspicious SSH activity on jump server" />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!newTitle || createSessionMutation.isPending} onClick={() => createSessionMutation.mutate({ data: { title: newTitle } })}>
                Create Session
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="flex-1 flex flex-col min-h-0 bg-card border-card-border overflow-hidden">
        <div className="p-4 border-b border-card-border flex gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search sessions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filteredSessions.length === 0 ? (
            <EmptyState title="No sessions found" description="Create a new session to begin investigation." />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0">
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Logs</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.map((session) => (
                  <TableRow key={session.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/sessions/${session.id}`)}>
                    <TableCell className="font-mono text-muted-foreground">#{session.id}</TableCell>
                    <TableCell className="font-medium">{session.title}</TableCell>
                    <TableCell><StatusBadge status={session.status} /></TableCell>
                    <TableCell className="font-mono">{session.logCount}</TableCell>
                    <TableCell>{format(new Date(session.createdAt), 'MMM d, HH:mm')}</TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}