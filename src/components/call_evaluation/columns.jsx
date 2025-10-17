import { MoreHorizontal, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useState } from "react"
import { API_ENDPOINTS } from "@/config/api"

// Score Details Dialog Component
function ScoreDetailsDialog({ callId }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [callData, setCallData] = useState(null)

  const fetchCallDetails = async () => {
    setLoading(true)
    try {
      const response = await fetch(API_ENDPOINTS.CALL_DETAIL(callId))
      const data = await response.json()
      setCallData(data)
    } catch (error) {
      console.error('Error fetching call details:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen) => {
    setOpen(newOpen)
    if (newOpen && !callData) {
      fetchCallDetails()
    }
  }

  const renderMetricRow = (name, metric) => {
    const isDetected = metric.detected
    const score = metric.score || 0
    const weight = metric.weight || 0
    
    return (
      <div key={name} className="flex items-center justify-between py-2 border-b last:border-b-0">
        <div className="flex items-center gap-2">
          <span className={isDetected ? "text-green-600" : "text-red-500"}>
            {isDetected ? "✓" : "✗"}
          </span>
          <span className="text-sm font-medium">
            {name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </span>
        </div>
        <span className="text-sm font-semibold">
          {metric.weighted_score?.toFixed(1) || 0}/{weight}
        </span>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <FileText className="mr-2 h-4 w-4" />
          View Score Details
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Call Evaluation Scorecard</DialogTitle>
          <DialogDescription>
            Detailed breakdown of metrics and scores for Call ID: {callId.substring(0, 12)}...
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="flex justify-center items-center h-40">
            Loading...
          </div>
        ) : callData?.binary_scores ? (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {/* Overall Score */}
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold">Total Score</span>
                  <span className="text-2xl font-bold text-primary">
                    {callData.binary_scores.total_score?.toFixed(1) || 0}/100
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {callData.binary_scores.percentage?.toFixed(1) || 0}% Performance
                </div>
              </div>

              {/* Metrics Breakdown */}
              <div className="space-y-2">
                <h3 className="font-semibold text-lg mb-3">Metrics Breakdown</h3>
                {callData.binary_scores.metrics && 
                  Object.entries(callData.binary_scores.metrics).map(([name, metric]) => 
                    renderMetricRow(name, metric)
                  )
                }
              </div>

              {/* Transcript Section */}
              {callData.transcript && (
                <div className="space-y-2 mt-6">
                  <h3 className="font-semibold text-lg">Transcription</h3>
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{callData.transcript}</p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex justify-center items-center h-40 text-muted-foreground">
            No score details available
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export const columns = [
  {
    accessorKey: "callId",
    header: "Call ID",
    cell: ({ getValue }) => {
      const fullId = getValue()
      return (
        <span className="font-mono text-xs">
          {fullId.substring(0, 16)}...
        </span>
      )
    }
  },
  {
    accessorKey: "agentName",
    header: "Agent Name",
  },
  {
    accessorKey: "dateOrTime",
    header: "Date & Time",
    cell: ({ getValue }) => (
      <span className="text-sm">{getValue()}</span>
    )
  },
  {
    accessorKey: "duration",
    header: "Duration",
    cell: ({ getValue }) => (
      <span className="font-mono text-sm">{getValue()}</span>
    )
  },
  {
    accessorKey: "classification",
    header: "Classification",
    cell: ({ getValue }) => {
      const classification = getValue()
      const variants = {
        'Excellent': 'default',
        'Satisfactory': 'secondary',
        'Needs Improvement': 'outline',
        'Unsatisfactory': 'destructive'
      }
      return (
        <Badge variant={variants[classification] || 'secondary'}>
          {classification}
        </Badge>
      )
    }
  },
  {
    accessorKey: "overallScore",
    header: "Overall Score",
    cell: ({ getValue }) => {
      const score = parseFloat(getValue())
      const color = score >= 85 ? 'text-green-600' : 
                    score >= 70 ? 'text-yellow-600' : 
                    score >= 50 ? 'text-orange-600' : 'text-red-600'
      return (
        <span className={`font-bold ${color}`}>
          {score}%
        </span>
      )
    }
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => {
      const status = getValue()
      const statusColors = {
        'completed': 'bg-green-100 text-green-800',
        'processing': 'bg-blue-100 text-blue-800',
        'failed': 'bg-red-100 text-red-800',
        'queued': 'bg-yellow-100 text-yellow-800'
      }
      return (
        <Badge variant="outline" className={statusColors[status] || ''}>
          {status}
        </Badge>
      )
    }
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const recording = row.original
 
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScoreDetailsDialog callId={recording.id} />
            <DropdownMenuItem>Play Recording</DropdownMenuItem>
            <DropdownMenuItem>Download Recording</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  }
]