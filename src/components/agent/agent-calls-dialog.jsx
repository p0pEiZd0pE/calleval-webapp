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
      <DialogContent className="xl:max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Agent Call History</DialogTitle>
          <DialogDescription>
            View all calls and performance metrics for this agent
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading agent data...</span>
          </div>
        )}

        {error && (
          <div className="text-red-500 py-4 text-center">
            <p>Error: {error}</p>
          </div>
        )}

        {data && !loading && !error && (
          <div className="space-y-4">
            {/* Agent Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">{data.agent.agentName}</CardTitle>
                    <CardDescription>{data.agent.position}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {getTrend(data.agent.avgScore)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Average Score</p>
                    <p className={`text-2xl font-bold ${getScoreColor(data.agent.avgScore)}`}>
                      {data.agent.avgScore || 0}/100
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Calls Handled</p>
                    <p className="text-2xl font-bold">
                      {data.agent.callsHandled || 0}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Uploads</p>
                    <p className="text-2xl font-bold">
                      {data.calls?.length || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Calls List */}
            <div>
              <h3 className="font-semibold text-lg mb-3">Call History</h3>
              <Separator className="mb-3" />
              
              {data.calls && data.calls.length > 0 ? (
                <ScrollArea className="h-[400px] w-full rounded-md border">
                  <div className="p-4 space-y-3">
                    {data.calls.map((call, index) => (
                      <Card key={call.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                                <Phone className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-sm">{call.filename}</p>
                                <p className="text-xs text-muted-foreground">
                                  {call.created_at ? new Date(call.created_at).toLocaleString() : 'N/A'}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Duration</p>
                                <p className="text-sm font-medium">{call.duration || 'N/A'}</p>
                              </div>
                              
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Score</p>
                                {call.score ? (
                                  <p className={`text-lg font-bold ${getScoreColor(call.score)}`}>
                                    {call.score}
                                  </p>
                                ) : (
                                  <p className="text-sm text-muted-foreground">Pending</p>
                                )}
                              </div>
                              
                              <div>
                                <Badge 
                                  variant={
                                    call.status === 'completed' ? 'default' : 
                                    call.status === 'failed' ? 'destructive' : 
                                    'secondary'
                                  }
                                >
                                  {call.status}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-12 text-muted-foreground border rounded-lg">
                  <Phone className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No calls found</p>
                  <p className="text-sm mt-1">
                    This agent hasn't had any calls uploaded yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}