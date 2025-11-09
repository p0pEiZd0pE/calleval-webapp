import { MoreHorizontal, FileText, Play, Download, User, Phone } from "lucide-react"
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
import { Separator } from "@/components/ui/separator"
import { useState } from "react"
import { API_ENDPOINTS } from "@/config/api"
import { toast } from "sonner"

// Score Details Dialog Component with Audio Player and Diarized Transcript
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
      toast.error('Failed to load call details')
    } finally {
      setLoading(false)
    }
  }

  const getAgentStats = () => {
    if (!callData?.speakers) return null;
    
    const agentSpeaker = Object.entries(callData.speakers).find(([_, role]) => role === 'agent')?.[0];
    const callerSpeaker = Object.entries(callData.speakers).find(([_, role]) => role === 'caller')?.[0];
    
    return { agentSpeaker, callerSpeaker };
  };

  const handleOpenChange = (newOpen) => {
    setOpen(newOpen)
    if (newOpen && !callData) {
      fetchCallDetails()
    }
  }

  const handleDownload = async () => {
    try {
      const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      
      // Fetch audio file
      const audioResponse = await fetch(`${backendUrl}/api/temp-audio/${callId}`)
      
      if (!audioResponse.ok) {
        throw new Error('Failed to fetch audio file')
      }
      
      // Get filename from Content-Disposition header
      const contentDisposition = audioResponse.headers.get('Content-Disposition')
      let audioFilename = 'recording.mp3'
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
        if (filenameMatch && filenameMatch[1]) {
          audioFilename = filenameMatch[1].replace(/['"]/g, '')
        }
      }
      
      // Download audio
      const audioBlob = await audioResponse.blob()
      const audioUrl = window.URL.createObjectURL(audioBlob)
      const audioLink = document.createElement('a')
      audioLink.href = audioUrl
      audioLink.download = audioFilename
      document.body.appendChild(audioLink)
      audioLink.click()
      document.body.removeChild(audioLink)
      window.URL.revokeObjectURL(audioUrl)
      
      // Download transcript if available
      if (callData.transcript) {
        const transcriptBlob = new Blob([callData.transcript], { type: 'text/plain' })
        const transcriptUrl = window.URL.createObjectURL(transcriptBlob)
        const transcriptLink = document.createElement('a')
        transcriptLink.href = transcriptUrl
        transcriptLink.download = `${callId}_transcript.txt`
        document.body.appendChild(transcriptLink)
        transcriptLink.click()
        document.body.removeChild(transcriptLink)
        window.URL.revokeObjectURL(transcriptUrl)
      }
      
      toast.success('Files downloaded successfully!')
    } catch (error) {
      console.error('Download error:', error)
      toast.error('Failed to download files')
    }
  }

  const renderMetricRow = (name, metric) => {
    const weight = metric.max_score || 0
    const isDetected = metric.detected || false
    
    return (
      <div key={name} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${isDetected ? "text-green-600" : "text-red-500"}`}>
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

  const audioUrl = callData ? 
    `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/temp-audio/${callId}` : 
    null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <FileText className="mr-2 h-4 w-4" />
          View Score Details
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="xl:max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-start justify-between pr-6">
            <div className="flex-1">
              <DialogTitle>Call Evaluation Details</DialogTitle>
              <DialogDescription className="mt-1.5">
                Call ID: {callId.substring(0, 20)}...
              </DialogDescription>
            </div>
            {callData && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="mt-0"
              >
                <Download className="mr-2 h-4 w-4" />
                Download All
              </Button>
            )}
          </div>
        </DialogHeader>
        
        {loading ? (
          <div className="flex justify-center items-center h-40">
            Loading...
          </div>
        ) : callData ? (
          <ScrollArea className="h-[70vh] pr-4">
            <div className="space-y-4">
              {/* Audio Player */}
              {audioUrl && (
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Play className="h-4 w-4" />
                    <span className="text-sm font-medium">Audio Recording</span>
                  </div>
                  <audio 
                    controls 
                    className="w-full"
                    src={audioUrl}
                  >
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}

              {/* Overall Score */}
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold">Total Score</span>
                  <span className="text-2xl font-bold text-primary">
                    {callData.binary_scores?.total_score?.toFixed(1) || callData.score?.toFixed(1) || 0}/100
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {callData.binary_scores?.percentage?.toFixed(1) || callData.score?.toFixed(1) || 0}% Performance
                </div>
              </div>

              {/* Metrics Breakdown */}
              {callData.binary_scores?.metrics && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg mb-3">Metrics Breakdown</h3>
                  {Object.entries(callData.binary_scores.metrics).map(([name, metric]) => 
                    renderMetricRow(name, metric)
                  )}
                </div>
              )}

              {/* Speaker Identification - NEW SECTION */}
              {callData.speakers && (() => {
                const stats = getAgentStats();
                return stats && (
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950 dark:to-green-950 rounded-lg border">
                    <p className="text-sm font-semibold mb-3">Speaker Identification</p>
                    <div className="flex justify-between">
                      <div className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900 px-3 py-2 rounded-md">
                        <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <div>
                          <span className="text-sm font-bold text-blue-700 dark:text-blue-300">AGENT</span>
                          <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">
                            ({stats.agentSpeaker || 'Unknown'})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-green-100 dark:bg-green-900 px-3 py-2 rounded-md">
                        <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <div>
                          <span className="text-sm font-bold text-green-700 dark:text-green-300">CALLER</span>
                          <span className="text-xs text-green-600 dark:text-green-400 ml-2">
                            ({stats.callerSpeaker || 'Unknown'})
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <Separator className="my-4" />

              {/* Diarized Transcription */}
              {callData.segments && callData.segments.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Diarized Transcription</h3>
                  <div className="space-y-3">
                    {callData.segments.map((segment, index) => {
                      const speaker = segment.speaker || 'UNKNOWN'
                      const speakerColor = speaker.includes('SPEAKER_00') ? 'text-blue-600' : 
                                         speaker.includes('SPEAKER_01') ? 'text-green-600' : 
                                         'text-gray-600'
                      const timestamp = segment.start && segment.end ? 
                        `${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s` : 
                        'N/A'
                      
                      return (
                        <div key={index} className="bg-muted p-3 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-semibold text-sm ${speakerColor}`}>
                              {speaker}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              [{timestamp}]
                            </span>
                          </div>
                          <p className="text-sm">{segment.text}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : callData.transcript ? (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Transcription</h3>
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{callData.transcript}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  No transcription available
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex justify-center items-center h-40 text-muted-foreground">
            No details available
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
      // UPDATED: Now only 3 variants instead of 4
      const variants = {
        'Excellent': 'default',
        'Good': 'secondary',
        'Needs Improvement': 'destructive'
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
      // UPDATED: Changed thresholds to 90 and 80
      const color = score >= 90 ? 'text-green-600' : 
                    score >= 80 ? 'text-blue-600' : 
                    'text-red-600'
      return (
        <span className={`font-semibold ${color}`}>
          {getValue()}
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
      
      const handleDownload = async () => {
        try {
          const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
          
          // Fetch the audio file
          const response = await fetch(`${backendUrl}/api/temp-audio/${recording.id}`)
          
          if (!response.ok) {
            throw new Error('Failed to fetch audio file')
          }
          
          // Get filename from Content-Disposition header or use default
          const contentDisposition = response.headers.get('Content-Disposition')
          let filename = 'recording.mp3'
          
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
            if (filenameMatch && filenameMatch[1]) {
              filename = filenameMatch[1].replace(/['"]/g, '')
            }
          }
          
          // Get the blob and create download link
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = filename
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)
          
          toast.success('Download started!')
        } catch (error) {
          console.error('Download error:', error)
          toast.error('Failed to download recording')
        }
      }
 
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
            <DropdownMenuItem onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download Recording
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  }
]