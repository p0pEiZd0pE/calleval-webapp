import React from 'react'
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
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


const chartData = [
  { agent: "Sarah L.", score: 186 },
  { agent: "Michael R.", score: 305 },
  { agent: "Jessica W.", score: 237 },
  { agent: "David K.", score: 73 },
  { agent: "Alice J.", score: 209 },
]

const chartConfig = {
  score: {
    label: "Performance Score",
    color: "var(--ring)",
  },
}

export default function AgentPerformanceScores() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Performance Scores</CardTitle>
        <CardDescription>Comparison of average performance scores by agent.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="agent"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar
              dataKey="score"
              fill="var(--color-score)"
              radius={8}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
