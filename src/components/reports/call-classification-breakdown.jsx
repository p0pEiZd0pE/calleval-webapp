import React from 'react'
import { Pie, PieChart, Cell, Label } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { API_ENDPOINTS } from '@/config/api'
import { authenticatedFetch } from '@/lib/api'

const chartConfig = {
  excellent: {
    label: "Excellent (90-100)",
    color: "#22c55e",
  },
  good: {
    label: "Good (80-89)",
    color: "#3b82f6",
  },
  needs_improvement: {
    label: "Needs Improvement (<80)",
    color: "#ef4444",
  },
}

export default function CallClassificationBreakdown({ filters }) {
  const [chartData, setChartData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [totalCalls, setTotalCalls] = React.useState(0);

  React.useEffect(() => {
    fetchClassificationData();
  }, [filters]);

  const fetchClassificationData = async () => {
    try {
      setLoading(true);
      
      const callsResponse = await authenticatedFetch(API_ENDPOINTS.CALLS);
      let callsData = await callsResponse.json();
      
      // Filter by agent if specified
      if (filters?.agentId && filters.agentId !== 'all') {
        callsData = callsData.filter(call => call.agent_id === filters.agentId);
      }
      
      // Only include completed calls with scores
      const completedCalls = callsData.filter(c => c.status === 'completed' && c.score);
      
      // Classify calls
      const excellent = completedCalls.filter(c => c.score >= 90).length;
      const good = completedCalls.filter(c => c.score >= 80 && c.score < 90).length;
      const needs_improvement = completedCalls.filter(c => c.score < 80).length;
      
      const data = [
        { 
          classification: "excellent", 
          count: excellent, 
          fill: chartConfig.excellent.color 
        },
        { 
          classification: "good", 
          count: good, 
          fill: chartConfig.good.color 
        },
        { 
          classification: "needs_improvement", 
          count: needs_improvement, 
          fill: chartConfig.needs_improvement.color 
        },
      ].filter(item => item.count > 0); // Only show categories with data
      
      setChartData(data);
      setTotalCalls(completedCalls.length);
      
    } catch (error) {
      console.error('Error fetching classification data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Call Classification Breakdown</CardTitle>
        <CardDescription>Distribution of calls by performance score</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        {loading ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            Loading...
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No evaluated calls available
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square max-h-[300px]"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent 
                    hideLabel
                    formatter={(value, name, props) => {
                      const percentage = totalCalls > 0 
                        ? ((value / totalCalls) * 100).toFixed(1)
                        : 0;
                      return [
                        `${value} calls (${percentage}%)`,
                        chartConfig[props.payload.classification]?.label
                      ];
                    }}
                  />
                }
              />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="classification"
                innerRadius={60}
                strokeWidth={5}
              >
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-3xl font-bold"
                          >
                            {totalCalls.toLocaleString()}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 24}
                            className="fill-muted-foreground"
                          >
                            Total Calls
                          </tspan>
                        </text>
                      )
                    }
                    return null
                  }}
                />
              </Pie>
              <ChartLegend 
                content={<ChartLegendContent nameKey="classification" />}
                className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
              />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}