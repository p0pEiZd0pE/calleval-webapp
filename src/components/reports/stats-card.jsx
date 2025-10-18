import React from 'react'
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { FileText, BarChart2, Phone, Users } from "lucide-react";
import { API_ENDPOINTS } from '@/config/api';

export default function StatsCards({ filters }) {
  const [stats, setStats] = React.useState({
    totalReports: 0,
    avgScore: 0,
    callsAnalyzed: 0,
    activeAgents: 0
  });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchStats();
  }, [filters]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      
      // Fetch calls
      const callsResponse = await fetch(API_ENDPOINTS.CALLS);
      const callsData = await callsResponse.json();
      
      // Fetch agents
      const agentsResponse = await fetch(API_ENDPOINTS.AGENT_STATS);
      const agentsData = await agentsResponse.json();
      
      // Apply filters
      let filteredCalls = callsData;
      
      if (filters?.agentId && filters.agentId !== 'all') {
        filteredCalls = filteredCalls.filter(call => call.agent_id === filters.agentId);
      }
      
      if (filters?.classification && filters.classification !== 'all') {
        filteredCalls = filteredCalls.filter(call => {
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
      
      // Calculate stats from filtered data
      const completedCalls = filteredCalls.filter(c => c.status === 'completed' && c.score);
      const avgScore = completedCalls.length > 0
        ? (completedCalls.reduce((sum, c) => sum + c.score, 0) / completedCalls.length).toFixed(1)
        : 0;
      
      setStats({
        totalReports: 0, // This would come from a reports table in your backend
        avgScore: parseFloat(avgScore),
        callsAnalyzed: completedCalls.length,
        activeAgents: agentsData.active || 0
      });
      
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statsData = [
    {
      title: "Total Reports Generated",
      icon: <FileText className="h-5 w-5 text-muted-foreground" />,
      value: loading ? "..." : stats.totalReports.toLocaleString(),
      caption: "Last 30 days",
    },
    {
      title: "Average Score",
      icon: <BarChart2 className="h-5 w-5 text-muted-foreground" />,
      value: loading ? "..." : `${stats.avgScore}%`,
      caption: filters?.agentId !== 'all' ? "For selected agent" : "Across all agents",
    },
    {
      title: "Calls Analyzed",
      icon: <Phone className="h-5 w-5 text-muted-foreground" />,
      value: loading ? "..." : stats.callsAnalyzed.toLocaleString(),
      caption: filters?.classification !== 'all' ? `${filters.classification} only` : "All evaluations",
    },
    {
      title: "Active Agents",
      icon: <Users className="h-5 w-5 text-muted-foreground" />,
      value: loading ? "..." : stats.activeAgents,
      caption: "Currently active",
    },
  ];

  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full w-full">
      {statsData.map((stat, idx) => (
        <Card key={idx} className="flex flex-col justify-between w-full h-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
            {stat.icon}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.caption}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}