import React from 'react'
import { TrendingDownIcon, TrendingUpIcon, TrendingUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis } from "recharts";
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

const callSentimentTrend = [
  { date: "2024-04-01", sentiment: 90},
  { date: "2024-04-02", sentiment: 95},
  { date: "2024-04-03", sentiment: 83},
  { date: "2024-04-04", sentiment: 88},
  { date: "2024-04-05", sentiment: 97},
  { date: "2024-04-06", sentiment: 79},
  { date: "2024-04-07", sentiment: 94},
];

const callResolutionRate = [
  { date: "2024-04-01", resolution: 75},
  { date: "2024-04-02", resolution: 89},
  { date: "2024-04-03", resolution: 45},
  { date: "2024-04-04", resolution: 69},
  { date: "2024-04-05", resolution: 93},
  { date: "2024-04-06", resolution: 46},
  { date: "2024-04-07", resolution: 88},
];

const callDurationDistribution = [
  { comparison: "Agent Avg", minutes: 10 },
  { comparison: "Team Avg", minutes: 7}
]

const chartConfig = {
  sentiment: {
    label: "Sentiment",
    color: "var(--ring)",
  },
};

const chartConfig2 = {
  resolution: {
    label: "Resolution",
    color: "var(--ring)",
  },
};

const chartConfig3 = {
  minutes: {
    label: "Call Duration",
    color: "var(--ring)",
  },
};

const callInsights = [
    {
      id: "call-101",
      date: "Jul 28, 2024",
      classification: "Satisfactory",
      classificationColor: "text-green-600",
      tone: "Positive",
      script: "High Adherence",
    },
    {
      id: "call-102",
      date: "Jul 27, 2024",
      classification: "Needs Review",
      classificationColor: "text-red-500",
      tone: "Neutral",
      script: "Moderate Adherence",
    },
    {
      id: "call-103",
      date: "Jul 26, 2024",
      classification: "Satisfactory",
      classificationColor: "text-green-600",
      tone: "Positive",
      script: "High Adherence",
    },
  ]




export default function AgentCardSection() {
  const [progress, setProgress] = React.useState();

  React.useEffect(() => {
    const timer = setTimeout(() => setProgress(90), 500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="grid grid-cols-3 gap-4 p-4">
      <Card>
        <CardHeader>
            <CardTitle className="text-xl">Performance Summary</CardTitle>
            <CardDescription>
            Overall performance metrics for Alice Johnson.
            </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col justify-evenly w-full h-full">
            {/* Overall Score */}
            <div>
            <p className="text-sm text-muted-foreground">Overall Score</p>
            <p className="text-3xl font-bold">92.5%</p>
            <p className="text-xs text-green-600 font-medium">↑ 2% increase</p>
            </div>

            {/* Calls Handled */}
            <div>
            <p className="text-sm text-muted-foreground">
                Calls Handled (Last 30 Days)
            </p>
            <p className="text-3xl font-bold">107</p>
            <p className="text-xs text-red-600 font-medium">↓ 1% decrease</p>
            </div>

            {/* Last Evaluation */}
            <div>
            <p className="text-sm text-muted-foreground">Last Evaluation</p>
            <p className="text-3xl font-bold">7/28/2024</p>
            <p className="text-xs text-green-600 font-medium">↑ 5% increase</p>
            </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
            <CardTitle className="text-xl">Call Sentiment Trend</CardTitle>
            <CardDescription>Average sentiment score over the last 30 days for Alice Johnson.</CardDescription>
        </CardHeader>
        <CardContent className="">
            <ChartContainer config={chartConfig}>
            <LineChart
                data={callSentimentTrend}
                margin={{ left: 12, right: 12 }}
            >
            <CartesianGrid vertical={false} />
            <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                tickFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    })
                }
            />

            <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
            />
            <Line
                dataKey="sentiment"
                type="natural"
                stroke="var(--color-sentiment)"
                strokeWidth={2}
                dot={false}
            />
            </LineChart>
            </ChartContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
            <CardTitle className="text-xl">Call Resolution Rate</CardTitle>
            <CardDescription>Percentage of resolved calls over the last 30 days for Alice Johnson.</CardDescription>
        </CardHeader>
        <CardContent>
            <ChartContainer config={chartConfig2}>
            <AreaChart
                data={callResolutionRate}
                margin={{ left: 12, right: 12 }}
            >
            <CartesianGrid vertical={false} />
            <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                tickFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    })
                }
            />

            <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
            />
            <Area
                dataKey="resolution"
                type="natural"
                stroke="var(--color-resolution)"
                fill="var(--color-resolution)"
                fillOpacity={0.4}
            />
            </AreaChart>
            </ChartContainer>
        </CardContent>
      </Card>
      <Card className="h-full flex flex-col justify-between">
        <CardHeader>
          <CardTitle className="text-xl">Script Adherence</CardTitle>
          <CardDescription>
            Consistency in following prescribed scripts for Alice Johnson.
          </CardDescription>
        </CardHeader>

        {/* Flex-grow section to center the content */}
        <CardContent className="flex-1 flex flex-col items-center justify-center gap-4">
          <h4 className="text-3xl font-semibold">90%</h4>
          <Progress value={90} className="w-[80%]" />
          <small className="text-sm">Adherence</small>
        </CardContent>

        <CardFooter className="flex justify-center pb-4">
          <small className="text-sm text-center text-muted-foreground">
            This score reflects how closely the agent followed predefined scripts.
          </small>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
            <CardTitle className="text-xl">Recent Call Insights</CardTitle>
            <CardDescription>Detailed summary of Alice Johnson's latest evaluations.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col justify-evenly w-full h-full">
          {callInsights.map((call, idx) => (
            <div key={call.id}>
              <div className="flex justify-between text-sm font-medium">
                <span>Call ID: {call.id}</span>
                <span className="text-muted-foreground">{call.date}</span>
              </div>
              <div className={`text-sm font-semibold ${call.classificationColor}`}>
                Classification: {call.classification}
              </div>
              <div className="text-sm text-muted-foreground">
                Tone: {call.tone} | Script: {call.script}
              </div>
              <Link href="#" className="text-sm text-blue-600 hover:underline">
                View Full Evaluation
              </Link>
              {idx < callInsights.length - 1 && <Separator className="my-3" />}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
            <CardTitle className="text-xl">Call Duration Distribution</CardTitle>
            <CardDescription>Average call duration for Alice Johnson compared to team average.</CardDescription>
        </CardHeader>
        <CardContent>
            <ChartContainer config={chartConfig3}>
            <LineChart
                data={callDurationDistribution}
                margin={{ left: 12, right: 12 }}
            >
            <CartesianGrid vertical={false} />
            <XAxis
                dataKey="comparison"
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
                dataKey="minutes"
                type="natural"
                stroke="var(--color-minutes)"
                strokeWidth={2}
                dot={true}
            />
            </LineChart>
            </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
