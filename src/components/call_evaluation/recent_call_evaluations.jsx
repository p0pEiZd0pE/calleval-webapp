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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { columns } from './columns'
import { DataTable } from './data-table'
import { API_ENDPOINTS } from '@/config/api'
import { toast } from 'sonner'
import { authenticatedFetch } from '@/lib/api';

export default function RecentCallEvaluations() {
  const [data, setData] = useState([])
  const [filteredData, setFilteredData] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState({
    callId: true,
    agentName: true,
    dateOrTime: true,
    duration: true,
    classification: true,
    overallScore: true,
    status: true,
    actions: true,
  })

  useEffect(() => {
    fetchCalls()
  }, [])

  useEffect(() => {
    // Filter data based on search term
    if (!searchTerm.trim()) {
      setFilteredData(data)
      return
    }

    const searchLower = searchTerm.toLowerCase()
    const filtered = data.filter(call => {
      return (
        call.callId?.toLowerCase().includes(searchLower) ||
        call.agentName?.toLowerCase().includes(searchLower) ||
        call.classification?.toLowerCase().includes(searchLower) ||
        call.status?.toLowerCase().includes(searchLower)
      )
    })
    setFilteredData(filtered)
  }, [searchTerm, data])

  const fetchCalls = async () => {
    try {
      setLoading(true)
      const response = await authenticatedFetch(API_ENDPOINTS.CALLS)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const calls = await response.json()
      
      // Transform backend data to match table structure
      // UPDATED CLASSIFICATION THRESHOLDS: Excellent 90-100, Good 80-89, Needs Improvement <80
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
        classification: call.score >= 90 ? 'Excellent' : 
                       call.score >= 80 ? 'Good' : 
                       'Needs Improvement',
        overallScore: call.score ? call.score.toFixed(1) : 'N/A',
        status: call.status,
        binary_scores: call.binary_scores
      }))
      
      setData(transformedData)
      setFilteredData(transformedData)
    } catch (error) {
      console.error('Error fetching calls:', error)
      toast.error('Failed to fetch calls')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = () => {
    try {
      // Filter columns based on visibility
      const visibleColumns = Object.keys(columnVisibility).filter(
        key => columnVisibility[key] && key !== 'actions'
      )

      // Create CSV headers
      const headers = visibleColumns.map(col => {
        const columnMap = {
          callId: 'Call ID',
          agentName: 'Agent Name',
          dateOrTime: 'Date & Time',
          duration: 'Duration',
          classification: 'Classification',
          overallScore: 'Overall Score',
          status: 'Status'
        }
        return columnMap[col] || col
      })

      // Create CSV rows
      const rows = filteredData.map(call => {
        return visibleColumns.map(col => {
          const value = call[col]
          // Escape commas and quotes in values
          return typeof value === 'string' && (value.includes(',') || value.includes('"'))
            ? `"${value.replace(/"/g, '""')}"`
            : value
        })
      })

      // Combine headers and rows
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n')

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      
      link.setAttribute('href', url)
      link.setAttribute('download', `call_evaluations_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      toast.success('Exported successfully!')
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export data')
    }
  }

  return (
    <Card>
      <CardHeader className='flex justify-between items-center w-full p-4'>
        <CardTitle className="text-xl font-bold">Recent Call Evaluations</CardTitle>
        <div className='flex flex-row gap-4'>
          <Input 
            placeholder="Search by Call ID, Agent, Classification, or Status..."
            className='h-10 px-4 py-2 rounded-md border border-input text-sm w-96'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          
          {/* Column Visibility Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className='bg-ring hover:bg-primary-foreground text-white h-10 px-4 py-2 flex items-center gap-2 rounded-md border text-sm'>
                <Funnel className="h-4 w-4"/>Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={columnVisibility.callId}
                onCheckedChange={(checked) => 
                  setColumnVisibility(prev => ({ ...prev, callId: checked }))
                }
              >
                Call ID
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={columnVisibility.agentName}
                onCheckedChange={(checked) => 
                  setColumnVisibility(prev => ({ ...prev, agentName: checked }))
                }
              >
                Agent Name
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={columnVisibility.dateOrTime}
                onCheckedChange={(checked) => 
                  setColumnVisibility(prev => ({ ...prev, dateOrTime: checked }))
                }
              >
                Date & Time
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={columnVisibility.duration}
                onCheckedChange={(checked) => 
                  setColumnVisibility(prev => ({ ...prev, duration: checked }))
                }
              >
                Duration
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={columnVisibility.classification}
                onCheckedChange={(checked) => 
                  setColumnVisibility(prev => ({ ...prev, classification: checked }))
                }
              >
                Classification
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={columnVisibility.overallScore}
                onCheckedChange={(checked) => 
                  setColumnVisibility(prev => ({ ...prev, overallScore: checked }))
                }
              >
                Overall Score
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={columnVisibility.status}
                onCheckedChange={(checked) => 
                  setColumnVisibility(prev => ({ ...prev, status: checked }))
                }
              >
                Status
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export Button */}
          <Button 
            className='bg-ring hover:bg-primary-foreground text-white h-10 px-4 py-2 flex items-center gap-2 rounded-md border text-sm'
            onClick={handleExport}
            disabled={filteredData.length === 0}
          >
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
          <DataTable 
            columns={columns} 
            data={filteredData}
            columnVisibility={columnVisibility}
          />
        )}
      </CardContent>
    </Card>
  )
}