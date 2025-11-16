import { useEffect, useState, useContext } from "react"
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { API_ENDPOINTS } from '@/config/api'
import { DateRangeContext } from './date-picker'
import { authenticatedFetch } from '@/lib/api';

export function SectionCards() {
  const { dateRange } = useContext(DateRangeContext)
  const [stats, setStats] = useState({
    totalCalls: 0,
    activeAgents: 0,
    avgDuration: "0:00",
    avgScore: 0,
    trends: {
      calls: 0,
      agents: 0,
      duration: 0,
      score: 0
    }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardStats()
  }, [dateRange])

  const fetchDashboardStats = async () => {
    try {
      setLoading(true)
      
      // Fetch calls data
      const callsResponse = await authenticatedFetch(API_ENDPOINTS.CALLS)
      const callsData = await callsResponse.json()
      
      // Fetch agent stats
      const agentsResponse = await authenticatedFetch(API_ENDPOINTS.AGENT_STATS)
      const agentsData = await agentsResponse.json()
      
      // Filter calls by date range
      const filteredCalls = callsData.filter(call => {
        const callDate = new Date(call.created_at)
        return callDate >= dateRange.from && callDate <= dateRange.to
      })
      
      // Calculate total calls
      const totalCalls = filteredCalls.length
      
      // Calculate average duration
      const durations = filteredCalls
        .filter(c => c.duration)
        .map(c => {
          const parts = c.duration.split(':')
          return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0)
        })
      
      const avgDurationSeconds = durations.length > 0 
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0
      
      const minutes = Math.floor(avgDurationSeconds / 60)
      const seconds = avgDurationSeconds % 60
      const avgDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`
      
      // Calculate average score
      const scores = filteredCalls.filter(c => c.score).map(c => c.score)
      const avgScore = scores.length > 0
        ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
        : 0
      
      // Calculate trends (compare with previous period)
      const periodLength = dateRange.to - dateRange.from
      const previousStart = new Date(dateRange.from.getTime() - periodLength)
      const previousEnd = dateRange.from
      
      const previousCalls = callsData.filter(call => {
        const callDate = new Date(call.created_at)
        return callDate >= previousStart && callDate < previousEnd
      })
      
      const callsTrend = previousCalls.length > 0
        ? (((totalCalls - previousCalls.length) / previousCalls.length) * 100).toFixed(1)
        : 0
      
      setStats({
        totalCalls,
        activeAgents: agentsData.active || 0,
        avgDuration,
        avgScore,
        trends: {
          calls: parseFloat(callsTrend),
          agents: 0, // Could calculate if you track historical agent data
          duration: 0, // Could calculate from historical data
          score: 0 // Could calculate from historical data
        }
      })
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="*:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card ">
      <Card className="@container/card">
        <CardHeader className="relative">
          <CardDescription>Total Calls Analyzed</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
            {loading ? "..." : stats.totalCalls.toLocaleString()}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
              {stats.trends.calls >= 0 ? (
                <TrendingUpIcon className="size-3" />
              ) : (
                <TrendingDownIcon className="size-3" />
              )}
              {Math.abs(stats.trends.calls)}%
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            from previous period {stats.trends.calls >= 0 ? (
              <TrendingUpIcon className="size-4" />
            ) : (
              <TrendingDownIcon className="size-4" />
            )}
          </div>
          <div className="text-muted-foreground">
            Calls within selected date range
          </div>
        </CardFooter>
      </Card>
      
      <Card className="@container/card">
        <CardHeader className="relative">
          <CardDescription>Active Agents</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
            {loading ? "..." : stats.activeAgents}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
              <TrendingUpIcon className="size-3" />
              Active
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Currently active agents
          </div>
          <div className="text-muted-foreground">
            Ready to handle calls
          </div>
        </CardFooter>
      </Card>
      
      <Card className="@container/card">
        <CardHeader className="relative">
          <CardDescription>Average Call Duration</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
            {loading ? "..." : `${stats.avgDuration} min`}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
              <TrendingUpIcon className="size-3" />
              {Math.abs(stats.trends.duration)}%
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Average across all calls
          </div>
          <div className="text-muted-foreground">Within date range</div>
        </CardFooter>
      </Card>
      
      <Card className="@container/card">
        <CardHeader className="relative">
          <CardDescription>Average Call Score</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
            {loading ? "..." : `${stats.avgScore}%`}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
              {stats.trends.score >= 0 ? (
                <TrendingUpIcon className="size-3" />
              ) : (
                <TrendingDownIcon className="size-3" />
              )}
              {Math.abs(stats.trends.score)}%
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Overall quality metric
          </div>
          <div className="text-muted-foreground">Meets performance targets</div>
        </CardFooter>
      </Card>
    </div>
  )
}