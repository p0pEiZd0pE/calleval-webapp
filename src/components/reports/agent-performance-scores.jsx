import React from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { API_ENDPOINTS } from '@/config/api'

const chartConfig = {
  score: {
    label: "Average Score",
    color: "var(--ring)",
  },
}

export default function AgentPerformanceScores({ filters }) {
  const [chartData, setChartData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchAgentPerformance();
  }, [filters]);

  const fetchAgentPerformance = async () => {
    try {
      setLoading(true);
      
      const agentsResponse = await fetch(API_ENDPOINTS.AGENTS);
      const agentsData = await agentsResponse.json();
      
      const callsResponse = await fetch(API_ENDPOINTS.CALLS);
      const callsData = await callsResponse.json();
      
      // Filter and calculate scores
      let filteredAgents = agentsData;
      
      if (filters?.agentId && filters.agentId !== 'all') {
        filteredAgents = filteredAgents.filter(a => a.agentId === filters.agentId);
      }
      
      const agentScores = filteredAgents.map(agent => {
        let agentCalls = callsData.filter(c => 
          c.agent_id === agent.agentId && 
          c.status === 'completed' && 
          c.score
        );
        
        // Apply classification filter
        if (filters?.classification && filters.classification !== 'all') {
          agentCalls = agentCalls.filter(call => {
            const score = call.score || 0;
            switch(filters.classification) {
              case 'excellent':
                return score >= 90;
              case 'good':
                return score >= 80 && score < 90;
              case 'needs_improvement':
                return score < 80;
              default:
                return true;
            }
          });
        }
        
        const avgScore = agentCalls.length > 0
          ? agentCalls.reduce((sum, c) => sum + c.score, 0) / agentCalls.length
          : 0;
        
        return {
          agent: agent.agentName.split(' ')[0] + ' ' + agent.agentName.split(' ')[1]?.charAt(0) + '.',
          score: Math.round(avgScore),
          fullName: agent.agentName,
          callCount: agentCalls.length
        };
      });
      
      // Sort by score descending and take top 10
      const sortedScores = agentScores
        .filter(a => a.callCount > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      
      setChartData(sortedScores);
      
    } catch (error) {
      console.error('Error fetching agent performance:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Performance Scores</CardTitle>
        <CardDescription>
          {filters?.classification !== 'all' 
            ? `Average scores for ${filters.classification} calls` 
            : 'Comparison of average performance scores by agent'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-full min-h-[300px]">
        {loading ? (
          <div className="text-muted-foreground">
            Loading...
          </div>
        ) : chartData.length === 0 ? (
          <div className="text-muted-foreground">
            No data available for the selected filters
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="w-full h-full">
            <BarChart accessibilityLayer data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="agent"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}%`}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent 
                  labelFormatter={(value, payload) => {
                    const data = payload[0]?.payload;
                    return data ? `${data.fullName} (${data.callCount} calls)` : value;
                  }}
                  formatter={(value) => [`${value}%`, 'Score']}
                />}
              />
              <Bar
                dataKey="score"
                fill="var(--color-score)"
                radius={8}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}