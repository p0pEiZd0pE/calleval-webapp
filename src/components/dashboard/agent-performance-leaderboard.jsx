"use client"

import React, { useEffect, useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { API_ENDPOINTS } from '@/config/api'
import { DateRangeContext } from './date-picker'

export function PerformanceLeaderboard({ className = "" }) {
  const navigate = useNavigate()
  const { dateRange } = useContext(DateRangeContext)
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAgentPerformance()
  }, [dateRange])

  const fetchAgentPerformance = async () => {
    try {
      setLoading(true)
      
      // Fetch agents
      const agentsResponse = await fetch(API_ENDPOINTS.AGENTS)
      const agentsData = await agentsResponse.json()
      
      // Fetch all calls
      const callsResponse = await fetch(API_ENDPOINTS.CALLS)
      const callsData = await callsResponse.json()
      
      // Filter calls by date range
      const filteredCalls = callsData.filter(call => {
        const callDate = new Date(call.created_at)
        return callDate >= dateRange.from && callDate <= dateRange.to
      })
      
      // Calculate performance for each agent within date range
      const agentPerformance = agentsData
        .map(agent => {
          const agentCalls = filteredCalls.filter(call => call.agent_id === agent.agentId)
          const scores = agentCalls.filter(c => c.score).map(c => c.score)
          const avgScore = scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : 0
          
          return {
            agentId: agent.agentId,
            agentName: agent.agentName,
            avgScore: avgScore,
            callsInPeriod: agentCalls.length,
            hasData: agentCalls.length > 0 && scores.length > 0
          }
        })
        // ONLY include agents with actual call data
        .filter(agent => agent.hasData)
      
      // Sort by score descending
      agentPerformance.sort((a, b) => b.avgScore - a.avgScore)
      
      // Get top 3 performers and bottom 2 performers (if available)
      const top3 = agentPerformance.slice(0, 3)
      const bottom2 = agentPerformance.length > 3 
        ? agentPerformance.slice(-2).reverse() 
        : []
      
      // Combine top 3 and bottom 2, ensuring no duplicates
      const leaderboard = [...top3]
      bottom2.forEach(agent => {
        // Only add if not already in top 3
        if (!top3.find(t => t.agentId === agent.agentId)) {
          leaderboard.push(agent)
        }
      })
      
      setAgents(leaderboard)
    } catch (error) {
      console.error('Error fetching agent performance:', error)
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  // Based on getPerformanceTrend from agent-card-section.jsx
  const getPerformanceClassification = (score) => {
    if (score >= 90) {
      return {
        label: 'Excellent',
        variant: 'default',
        className: 'bg-green-500 text-white dark:bg-green-600'
      }
    } else if (score >= 80) {
      return {
        label: 'Good',
        variant: 'secondary',
        className: 'bg-blue-500 text-white dark:bg-blue-600'
      }
    } else {
      return {
        label: 'Needs Improvement',
        variant: 'destructive',
        className: ''
      }
    }
  }

  return (
    <Card className={`h-full flex flex-col ${className}`}> 
      <CardHeader>
        <CardTitle>Agent Performance Leaderboard</CardTitle>
        <CardDescription>Top and bottom performing agents based on recent evaluations.</CardDescription>
      </CardHeader>
      
      {loading ? (
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            Loading agent performance...
          </div>
        </CardContent>
      ) : agents.length === 0 ? (
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            No agent performance data available for the selected period
          </div>
        </CardContent>
      ) : (
        <>
          {agents.map((agent) => {
            const classification = getPerformanceClassification(agent.avgScore)
            return (
              <CardContent key={agent.agentId}>
                <div className='flex flex-row gap-2'>
                  <Avatar className="h-8 w-8 rounded-full grayscale">
                    <AvatarImage/>
                    <AvatarFallback className="rounded-full">{getInitials(agent.agentName)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className='truncate font-semibold'>{agent.agentName}</span>
                    <span className='truncate text-xs'>
                      Score: {agent.avgScore.toFixed(1)}% ({agent.callsInPeriod} {agent.callsInPeriod === 1 ? 'call' : 'calls'})
                    </span>
                  </div>
                  <Badge 
                    variant={classification.variant}
                    className={`${classification.className} min-w-30 rounded-full`}
                  >
                    {classification.label}
                  </Badge>
                </div>
              </CardContent>
            )
          })}
        </>
      )}
      
      <CardFooter className="justify-center mt-auto">
        <Button 
          variant="ghost"
          onClick={() => navigate('/agent')}
        >
          View All Agents
        </Button>
      </CardFooter>
    </Card>
  )
}