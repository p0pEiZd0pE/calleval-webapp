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
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { API_ENDPOINTS } from '@/config/api'
import { DateRangeContext } from './date-picker'

export function RecentHighImpactCalls() {
  const navigate = useNavigate()
  const { dateRange } = useContext(DateRangeContext)
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecentCalls()
  }, [dateRange])

  const fetchRecentCalls = async () => {
    try {
      setLoading(true)
      const response = await fetch(API_ENDPOINTS.CALLS)
      const callsData = await response.json()
      
      // Filter by date range and get recent 5 calls
      const filteredCalls = callsData
        .filter(call => {
          const callDate = new Date(call.created_at)
          return callDate >= dateRange.from && callDate <= dateRange.to
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5)
      
      setCalls(filteredCalls)
    } catch (error) {
      console.error('Error fetching recent calls:', error)
    } finally {
      setLoading(false)
    }
  }

  const getClassification = (score) => {
    if (score >= 85) return 'Excellent'
    if (score >= 70) return 'Satisfactory'
    if (score >= 50) return 'Needs Improvement'
    return 'Unsatisfactory'
  }

  const getClassificationVariant = (classification) => {
    switch (classification) {
      case 'Excellent':
        return 'default'
      case 'Satisfactory':
        return 'secondary'
      case 'Needs Improvement':
        return 'outline'
      case 'Unsatisfactory':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Call Evaluations</CardTitle>
        <CardDescription>Latest call evaluations within the selected date range.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center text-muted-foreground py-8">
            Loading recent calls...
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No calls available for the selected date range
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Call ID</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call) => {
                const classification = getClassification(call.score)
                return (
                  <TableRow key={call.id}>
                    <TableCell className="font-mono text-xs">
                      {call.id.substring(0, 8)}...
                    </TableCell>
                    <TableCell className="font-medium">
                      {call.agent_name || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(call.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {call.duration || 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getClassificationVariant(classification)}>
                        {classification}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {call.score ? call.score.toFixed(1) : 'N/A'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CardFooter className="justify-center">
        <Button 
          variant="ghost"
          onClick={() => navigate('/call_evaluations')}
        >
          View All Evaluations
        </Button>
      </CardFooter>
    </Card>
  )
}