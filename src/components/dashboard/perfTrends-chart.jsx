"use client"

import React, { useEffect, useState, useContext } from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { useIsMobile } from "@/hooks/use-mobile"
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
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { API_ENDPOINTS } from '@/config/api'
import { DateRangeContext } from './date-picker'

const chartConfig = {
  adherenceScore: {
    label: "Script Adherence Score",
    color: "var(--ring)",
  },
}

export function ChartAreaInteractive({ className = "" }) {
  const isMobile = useIsMobile()
  const { dateRange } = useContext(DateRangeContext)
  const [timeRange, setTimeRange] = useState("30d")
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  useEffect(() => {
    fetchChartData()
  }, [timeRange, dateRange])

  const fetchChartData = async () => {
    try {
      setLoading(true)
      const response = await fetch(API_ENDPOINTS.CALLS)
      const calls = await response.json()
      
      console.log('=== CHART DATA DEBUG ===')
      console.log('Total calls fetched:', calls.length)
      
      // Filter by date range and time range
      const now = new Date()
      let startDate = new Date()
      
      if (timeRange === "7d") {
        startDate.setDate(now.getDate() - 7)
      } else if (timeRange === "30d") {
        startDate.setDate(now.getDate() - 30)
      } else {
        startDate.setDate(now.getDate() - 90)
      }
      
      const filteredCalls = calls.filter(call => {
        const callDate = new Date(call.created_at)
        return callDate >= startDate && callDate <= now &&
               callDate >= dateRange.from && callDate <= dateRange.to
      })
      
      console.log('Filtered calls:', filteredCalls.length)
      
      // Group calls by date
      const callsByDate = {}
      filteredCalls.forEach((call, index) => {
        const dateKey = new Date(call.created_at).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })
        
        if (!callsByDate[dateKey]) {
          callsByDate[dateKey] = {
            scores: [],
            adherenceScores: []
          }
        }
        
        // Add overall call score
        if (call.score) {
          callsByDate[dateKey].scores.push(call.score)
        }
        
        // Debug first call's binary_scores
        if (index === 0) {
          console.log('=== FIRST CALL DEBUG ===')
          console.log('Call ID:', call.id)
          console.log('Call score:', call.score)
          console.log('Binary scores (raw):', call.binary_scores)
          console.log('Binary scores type:', typeof call.binary_scores)
        }
        
        // Extract adherence score from binary_scores
        if (call.binary_scores) {
          try {
            // Check if it's already an object or needs parsing
            let binaryScores = call.binary_scores
            
            if (typeof binaryScores === 'string') {
              binaryScores = JSON.parse(binaryScores)
            }
            
            // Debug first call's parsed structure
            if (index === 0) {
              console.log('Parsed binary scores:', binaryScores)
              console.log('Has total_score?', 'total_score' in binaryScores)
              console.log('Has percentage?', 'percentage' in binaryScores)
              console.log('Keys:', Object.keys(binaryScores))
            }
            
            // The adherence score is the total_score from binary_scores
            let adherenceScore = null
            
            if (binaryScores.total_score !== undefined && binaryScores.total_score !== null) {
              adherenceScore = binaryScores.total_score
            } else if (binaryScores.percentage !== undefined && binaryScores.percentage !== null) {
              adherenceScore = binaryScores.percentage
            }
            
            if (adherenceScore !== null) {
              callsByDate[dateKey].adherenceScores.push(adherenceScore)
              if (index === 0) {
                console.log('✓ Added adherence score:', adherenceScore)
              }
            } else {
              if (index === 0) {
                console.log('✗ No adherence score found')
              }
            }
          } catch (e) {
            console.error('Error parsing binary scores for call', call.id, ':', e)
          }
        } else {
          if (index === 0) {
            console.log('✗ Call has no binary_scores field')
          }
        }
      })
      
      console.log('Calls grouped by date:', Object.keys(callsByDate).length, 'days')
      
      // Calculate averages and format data
      const formattedData = Object.keys(callsByDate).map(date => {
        const { scores, adherenceScores } = callsByDate[date]
        
        const avgScore = scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0
        
        const avgAdherence = adherenceScores.length > 0
          ? adherenceScores.reduce((a, b) => a + b, 0) / adherenceScores.length
          : 0
        
        return {
          date,
          avgCallScore: Math.round(avgScore),
          adherenceScore: Math.round(avgAdherence)
        }
      })
      
      // Sort by date
      formattedData.sort((a, b) => new Date(a.date) - new Date(b.date))
      
      console.log('Final formatted data:', formattedData)
      console.log('Sample:', formattedData[0])
      console.log('=== END DEBUG ===')
      
      setChartData(formattedData)
    } catch (error) {
      console.error('Error fetching chart data:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className={`h-full flex flex-col ${className}`}>
      <CardHeader className="relative">
        <CardTitle>Performance Trends</CardTitle>
        <CardDescription>
          Daily trends for average call score and script adherence score.
        </CardDescription>
        <div className="absolute right-4 top-4">
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={setTimeRange}
            variant="outline"
            className="@[767px]/card:flex hidden"
          >
            <ToggleGroupItem value="90d" className="h-8 px-2.5">
              Last 3 months
            </ToggleGroupItem>
            <ToggleGroupItem value="30d" className="h-8 px-2.5">
              Last 30 days
            </ToggleGroupItem>
            <ToggleGroupItem value="7d" className="h-8 px-2.5">
              Last 7 days
            </ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="@[767px]/card:hidden flex w-40"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Last 3 months
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="flex-grow px-2 pt-4 sm:px-6 sm:pt-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Loading chart data...</p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No data available for selected period</p>
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-full w-full"
          >
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="fillAdherenceScore" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-adherenceScore)"
                    stopOpacity={1.0}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-adherenceScore)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
                <linearGradient id="fillAvgCallScore" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-avgCallScore)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-avgCallScore)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => value}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="avgCallScore"
                type="natural"
                fill="url(#fillAvgCallScore)"
                stroke="var(--color-avgCallScore)"
                stackId="a"
              />
              <Area
                dataKey="adherenceScore"
                type="natural"
                fill="url(#fillAdherenceScore)"
                stroke="var(--color-adherenceScore)"
                stackId="a"
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}