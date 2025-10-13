// src/components/agent/agent-calls-dialog.jsx
import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Loader2, Phone, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { API_ENDPOINTS } from "@/config/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function AgentCallsDialog({ agentId, open, onOpenChange, children }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && agentId) {
      fetchAgentCalls();
    }
  }, [open, agentId]);

  const fetchAgentCalls = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(API_ENDPOINTS.AGENT_CALLS(agentId));
      
      if (!response.ok) {
        throw new Error('Failed to fetch agent calls');
      }
      
      const result = await response.json();
      console.log('Agent calls data:', result);
      setData(result);
    } catch (err) {
      console.error('Error fetching agent calls:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (!score) return "text-gray-400";
    if (score >= 90) return "text-green-600";
    if (score >= 80) return "text-yellow-600";
    if (score >= 70) return "text-orange-600";
    return "text-red-600";
  };

  const getScoreBadge = (score) => {
    if (!score) return "secondary";
    if (score >= 90) return "default";
    if (score >= 80) return "secondary";
    return "destructive";
  };

  const getTrend = (avgScore) => {
    if (avgScore >= 90) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (avgScore >= 80) return <Minus className="h-4 w-4 text-yellow-500" />;
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
      <DialogContent className="w-[95vw] max-w-4xl h-[90vh] max-h-[900px] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 space-y-2">
          <DialogTitle className="text-xl md:text-2xl">Agent Call History</DialogTitle>
          <DialogDescription className="text-sm">
            View all calls and performance metrics for this agent
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="flex-1 overflow-hidden px-6 pb-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading agent data...</span>
            </div>
          )}

          {error && (
            <div className="text-red-500 py-8 text-center">
              <p>Error: {error}</p>
            </div>
          )}

          {data && !loading && !error && (
            <div className="space-y-4 h-full flex flex-col">
              {/* Agent Summary Card */}
              <Card className="flex-shrink-0">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg md:text-xl">{data.agentName}</CardTitle>
                      <CardDescription className="text-sm">{data.position}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {getTrend(data.avgScore)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3 md:gap-6">
                    <div className="text-center">
                      <p className="text-xs md:text-sm text-muted-foreground mb-1">Average Score</p>
                      <p className={`text-xl md:text-3xl font-bold ${getScoreColor(data.avgScore)}`}>
                        {data.avgScore}/100
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs md:text-sm text-muted-foreground mb-1">Calls Handled</p>
                      <p className="text-xl md:text-3xl font-bold">{data.callsHandled || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs md:text-sm text-muted-foreground mb-1">Total Uploads</p>
                      <p className="text-xl md:text-3xl font-bold">{data.totalUploads || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Call History */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <h3 className="text-base md:text-lg font-semibold mb-3">Call History</h3>
                
                {data.calls && data.calls.length > 0 ? (
                  <ScrollArea className="flex-1 pr-4">
                    <div className="space-y-3">
                      {data.calls.map((call) => (
                        <Card key={call.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div className="flex-shrink-0 mt-1">
                                  <div className="bg-primary/10 p-2 rounded-full">
                                    <Phone className="h-4 w-4 text-primary" />
                                  </div>
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm md:text-base truncate">
                                    {call.filename}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {call.created_at ? 
                                      new Date(call.created_at).toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      }) : 'N/A'}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground">Duration</p>
                                  <p className="text-sm font-medium">{call.duration || 'N/A'}</p>
                                </div>
                                
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground">Score</p>
                                  {call.score ? (
                                    <p className={`text-base md:text-lg font-bold ${getScoreColor(call.score)}`}>
                                      {call.score}
                                    </p>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">Pending</p>
                                  )}
                                </div>
                                
                                <Badge 
                                  variant={
                                    call.status === 'completed' ? 'default' : 
                                    call.status === 'failed' ? 'destructive' : 
                                    'secondary'
                                  }
                                  className="text-xs"
                                >
                                  {call.status}
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center py-12 text-muted-foreground">
                      <Phone className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No calls found</p>
                      <p className="text-sm mt-1">
                        This agent hasn't had any calls uploaded yet.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}