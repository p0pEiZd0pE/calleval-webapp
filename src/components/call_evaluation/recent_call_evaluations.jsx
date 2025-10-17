import React, { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Funnel, Download } from 'lucide-react'
import { columns } from './columns'
import { DataTable } from './data-table'
import { API_ENDPOINTS } from '@/config/api'

export default function RecentCallEvaluations() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCalls()
  }, [])

  const fetchCalls = async () => {
    try {
      setLoading(true)
      const response = await fetch(API_ENDPOINTS.CALLS)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const calls = await response.json()
      
      // Transform backend data to match table structure
      const transformedData = calls.map(call => ({
        id: call.id,
        callId: call.id,
        agentName: call.agent_name || 'Unknown',
        dateOrTime: new Date(call.created_at).toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }),
        duration: call.duration || 'N/A',
        classification: call.score >= 85 ? 'Excellent' : 
                       call.score >= 70 ? 'Satisfactory' : 
                       call.score >= 50 ? 'Needs Improvement' : 'Unsatisfactory',
        overallScore: call.score ? call.score.toFixed(1) : 'N/A',
        status: call.status,
        binary_scores: call.binary_scores
      }))
      
      setData(transformedData)
    } catch (error) {
      console.error('Error fetching calls:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className='flex justify-between items-center w-full p-4'>
        <CardTitle className="text-xl font-bold">Recent Call Evaluations</CardTitle>
        <div className='flex flex-row gap-4'>
          <Input 
            placeholder="Search calls... "
            className='h-10 px-4 py-2 rounded-md border border-input text-sm'
          />
          <Button className='bg-ring hover:bg-primary-foreground text-white h-10 px-4 py-2 flex items-center gap-2 rounded-md border text-sm'>
            <Funnel className="h-4 w-4"/>Columns
          </Button>
          <Button className='bg-ring hover:bg-primary-foreground text-white h-10 px-4 py-2 flex items-center gap-2 rounded-md border text-sm'>
            <Download className="h-4 w-4"/>Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center items-center h-40">
            Loading...
          </div>
        ) : (
          <DataTable columns={columns} data={data} />
        )}
      </CardContent>
    </Card>
  )
}