import React from 'react'
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

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

const chartData = [
  { month: "January", callVolume: 400, satisfactionTrend: 245 },
  { month: "February", callVolume: 300, satisfactionTrend: 135 },
  { month: "March", callVolume: 225, satisfactionTrend: 990 },
  { month: "April", callVolume: 260, satisfactionTrend: 400 },
  { month: "May", callVolume: 209, satisfactionTrend: 475 },
  { month: "June", callVolume: 245, satisfactionTrend: 410 },
  { month: "July", callVolume: 330, satisfactionTrend: 440 },
  { month: "August", callVolume: 400, satisfactionTrend: 500 },
]

const chartConfig = {
  callVolume: {
    label: "Call Volume",
    color: "var(--ring)",
  },
  satisfactionTrend: {
    label: "Satisfaction Trend",
    color: "var(--primary-foreground)",
  },
}

export default function CallVolumenAndSatifactionTrend() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Call Volume & Satisfaction Trend</CardTitle>
        <CardDescription>
          Monthly trends for total calls and customer satisfaction.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart
            data={chartData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 5)}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Area
              dataKey="callVolume"
              type="linear"
              fill="var(--color-callVolume)"
              fillOpacity={0.4}
              stroke="var(--color-callVolume)"
              stackId="a"
            />
            <Area
              dataKey="satisfactionTrend"
              type="linear"
              fill="var(--color-satisfactionTrend)"
              fillOpacity={0.4}
              stroke="var(--color-satisfactionTrend)"
              stackId="a"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
