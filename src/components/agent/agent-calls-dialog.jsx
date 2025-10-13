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
      <DialogContent className="max-w-[95vw] w-[1200px] h-[85vh] flex flex-col p-0 gap-0">
        {/* Header - Fixed */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-2xl">Agent Call History</DialogTitle>
            <DialogDescription>
              View all calls and performance metrics for this agent
            </DialogDescription>
          </DialogHeader>
        </div>

        <Separator className="flex-shrink-0" />

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-full">
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
            <div className="space-y-6">
              {/* Agent Summary Card */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-semibold">{data.agentName}</h3>
                      <p className="text-sm text-muted-foreground">{data.position}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getTrend(data.avgScore)}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-8">
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">Average Score</p>
                      <p className={`text-4xl font-bold ${getScoreColor(data.avgScore)}`}>
                        {data.avgScore}/100
                      </p>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">Calls Handled</p>
                      <p className="text-4xl font-bold">{data.callsHandled || 0}</p>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">Total Uploads</p>
                      <p className="text-4xl font-bold">{data.totalUploads || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Call History */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Call History</h3>
                
                {data.calls && data.calls.length > 0 ? (
                  <div className="space-y-3">
                    {data.calls.map((call) => (
                      <Card key={call.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-5">
                          <div className="flex items-center justify-between gap-6">
                            {/* Left: Call Info */}
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <div className="flex-shrink-0">
                                <div className="bg-primary/10 p-3 rounded-full">
                                  <Phone className="h-5 w-5 text-primary" />
                                </div>
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-base truncate mb-1">
                                  {call.filename}
                                </p>
                                <p className="text-sm text-muted-foreground">
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
                            
                            {/* Right: Call Stats */}
                            <div className="flex items-center gap-8">
                              <div className="text-center min-w-[80px]">
                                <p className="text-xs text-muted-foreground mb-1">Duration</p>
                                <p className="text-base font-semibold">{call.duration || 'N/A'}</p>
                              </div>
                              
                              <div className="text-center min-w-[80px]">
                                <p className="text-xs text-muted-foreground mb-1">Score</p>
                                {call.score ? (
                                  <p className={`text-2xl font-bold ${getScoreColor(call.score)}`}>
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
                                className="min-w-[90px] justify-center py-1.5"
                              >
                                {call.status}
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 border rounded-lg bg-muted/20">
                    <Phone className="h-16 w-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">No calls found</p>
                    <p className="text-sm text-muted-foreground">
                      This agent hasn't had any calls uploaded yet.
                    </p>
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