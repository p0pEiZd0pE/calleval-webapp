import React from 'react'

import { TrendingUp } from "lucide-react"
import { Pie, PieChart, Label } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"

const chartData = [
  { classification: "satisfactory", calls: 275, fill: "var(--color-satisfactory)" },
  { classification: "neutral", calls: 200, fill: "var(--color-neutral)" },
  { classification: "unsatisfactory", calls: 287, fill: "var(--color-unsatisfactory)" },
]

const chartConfig = {
  calls: {
    label: "Call Classification",
  },
  satisfactory: {
    label: "Satisfactory",
    color: "var(--ring)",
  },
  neutral: {
    label: "Neutral",
    color: "var(--primary)",
  },
  unsatisfactory: {
    label: "Unsatisfactory",
    color: "var(--primary-foreground)",
  },
}

export default function CallClassificationBreakdown() {
  const totalVisitors = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.calls, 0)
  }, [])

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Call Classification Breakdown</CardTitle>
        <CardDescription>Distribution of call outcomes across different categories.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="calls"
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
                          {totalVisitors.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground"
                        >
                          Call Classification
                        </tspan>
                      </text>
                    )
                  }
                  return null
                }}
              />
            </Pie>
            <ChartLegend content={<ChartLegendContent />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
