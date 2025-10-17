import React, { useEffect, useState } from 'react'
import { TrendingDownIcon, TrendingUpIcon, TrendingUp, Phone, Clock, Award } from "lucide-react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, BarChart, Bar } from "recharts";
import { Separator } from "@/components/ui/separator"
import { Link } from "react-router-dom";
import {
  Card,
  CardDescription,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const chartConfig = {
  sentiment: {
    label: "Sentiment",
    color: "hsl(var(--chart-1))",
  },
};

const chartConfig2 = {
  resolution: {
    label: "Resolution",
    color: "hsl(var(--chart-2))",
  },
};

const chartConfig3 = {
  score: {
    label: "Score",
    color: "hsl(var(--chart-3))",
  },
};

export default function AgentCardSection({ agent, calls = [] }) {
  const [callTrends, setCallTrends] = useState([]);
  const [callInsights, setCallInsights] = useState([]);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    avgHandleTime: "0:00",
    customerSatisfaction: 0,
    scriptAdherence: 0
  });

  useEffect(() => {
    if (!agent || !calls) return;

    // Process calls for trends (last 7 calls)
    const recentCalls = calls.slice(0, 7).reverse();
    const trends = recentCalls.map((call, index) => ({
      date: new Date(call.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: call.score || 0,
      callIndex: `Call ${index + 1}`
    }));
    setCallTrends(trends);

    // Process call insights (last 5 calls)
    const insights = calls.slice(0, 5).map(call => {
      const score = call.score || 0;
      return {
        id: call.id.substring(0, 8),
        date: new Date(call.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        classification: score >= 85 ? "Excellent" : score >= 70 ? "Satisfactory" : "Needs Review",
        classificationColor: score >= 85 ? "text-green-600" : score >= 70 ? "text-yellow-600" : "text-red-500",
        score: score,
        duration: call.duration || "N/A",
        status: call.status
      };
    });
    setCallInsights(insights);

    // Calculate performance metrics
    if (calls.length > 0) {
      // Average handle time
      const durations = calls
        .filter(c => c.duration)
        .map(c => {
          const parts = c.duration.split(':');
          return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
        });
      
      const avgDuration = durations.length > 0 
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
      
      const minutes = Math.floor(avgDuration / 60);
      const seconds = avgDuration % 60;
      
      setPerformanceMetrics({
        avgHandleTime: `${minutes}:${seconds.toString().padStart(2, '0')}`,
        customerSatisfaction: agent.avgScore || 0,
        scriptAdherence: Math.round((calls.filter(c => c.score >= 70).length / calls.length) * 100)
      });
    }
  }, [agent, calls]);

  if (!agent) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">No Agent Selected</p>
        <p className="text-sm mt-2">Click "View Profile" on any agent to see their detailed performance metrics</p>
      </div>
    );
  }

  const getPerformanceTrend = (score) => {
    if (score >= 90) {
      return <div className="flex items-center text-green-600">
        <TrendingUpIcon className="h-4 w-4 mr-1" />
        <span className="text-sm">Excellent</span>
      </div>;
    } else if (score >= 80) {
      return <div className="flex items-center text-yellow-600">
        <TrendingUpIcon className="h-4 w-4 mr-1" />
        <span className="text-sm">Good</span>
      </div>;
    } else {
      return <div className="flex items-center text-red-600">
        <TrendingDownIcon className="h-4 w-4 mr-1" />
        <span className="text-sm">Needs Improvement</span>
      </div>;
    }
  };

  return (
    <div id="agent-card-section" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {/* Performance Summary Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">Performance Summary</CardTitle>
              <CardDescription>
                Overall metrics for {agent.agentName}
              </CardDescription>
            </div>
            <Badge variant={agent.status === "Active" ? "default" : "secondary"}>
              {agent.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Position</span>
              <span className="font-medium">{agent.position}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Agent ID</span>
              <span className="font-mono text-sm">{agent.agentId}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Overall Score</span>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold ${
                  agent.avgScore >= 90 ? "text-green-600" :
                  agent.avgScore >= 80 ? "text-yellow-600" :
                  "text-red-600"
                }`}>
                  {agent.avgScore}/100
                </span>
                {getPerformanceTrend(agent.avgScore)}
              </div>
            </div>
            <Progress value={agent.avgScore} className="h-2" />
            
            <div className="pt-2 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Calls Handled</span>
                <span className="font-semibold">{agent.callsHandled}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg Handle Time</span>
                <span className="font-semibold">{performanceMetrics.avgHandleTime}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Script Adherence</span>
                <span className="font-semibold">{performanceMetrics.scriptAdherence}%</span>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <small className="text-muted-foreground">
            Last updated: {new Date().toLocaleDateString()}
          </small>
        </CardFooter>
      </Card>

      {/* Recent Call Insights Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Recent Call Insights</CardTitle>
          <CardDescription>Latest evaluation results for {agent.agentName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {callInsights.length > 0 ? (
            callInsights.map((call, idx) => (
              <div key={call.id} className="space-y-2">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm font-medium">Call #{call.id}</span>
                      <Badge variant={
                        call.status === 'completed' ? 'default' : 
                        call.status === 'failed' ? 'destructive' : 
                        'secondary'
                      } className="text-xs">
                        {call.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{call.date}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {call.duration}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${call.classificationColor}`}>
                      {call.score.toFixed(1)}
                    </div>
                    <div className={`text-xs ${call.classificationColor}`}>
                      {call.classification}
                    </div>
                  </div>
                </div>
                {idx < callInsights.length - 1 && <Separator />}
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No calls recorded yet</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score Trend Chart Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Score Trend</CardTitle>
          <CardDescription>Performance over recent calls</CardDescription>
        </CardHeader>
        <CardContent>
          {callTrends.length > 0 ? (
            <ChartContainer config={chartConfig3}>
              <LineChart
                data={callTrends}
                margin={{ left: 12, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval="preserveStartEnd"
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel />}
                />
                <Line
                  dataKey="score"
                  type="monotone"
                  stroke="var(--color-score)"
                  strokeWidth={2}
                  dot={true}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              <div className="text-center">
                <TrendingUpIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No trend data available</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}