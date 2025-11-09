import { MoreHorizontal, FileText, Play, Download, User, Phone, Trash2 } from "lucide-react"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Call Evaluation Details</DialogTitle>
          <DialogDescription>
            Detailed scores and transcription for Call ID: {callId}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center items-center h-40">
            Loading...
          </div>
        ) : callData ? (
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-4">
              {/* Audio Player */}
              {audioUrl && (
                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="font-semibold text-lg mb-2">Audio Recording</h3>
                  <audio controls className="w-full">
                    <source src={audioUrl} type="audio/mpeg" />
                    Your browser does not support the audio element.
                  </audio>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleDownload}>
                      <Download className="mr-2 h-4 w-4" />
                      Download Audio & Transcript
                    </Button>
                  </div>
                </div>
              )}

              <Separator />

              {/* Overall Score */}
              <div className="bg-primary/10 p-4 rounded-lg">
                <h3 className="font-semibold text-lg">Overall Score</h3>
                <p className="text-3xl font-bold text-primary">
                  {callData.score ? callData.score.toFixed(1) : 'N/A'}/100
                </p>
              </div>

              <Separator />

              {/* Binary Scores by Phase */}
              {callData.binary_scores && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">CallEval Metrics</h3>
                  
                  {/* All Phases */}
                  {callData.binary_scores.all_phases && Object.keys(callData.binary_scores.all_phases).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-md bg-muted px-3 py-2 rounded-md">All Phases</h4>
                      <div className="space-y-1">
                        {Object.entries(callData.binary_scores.all_phases).map(([name, metric]) => 
                          renderMetricRow(name, metric)
                        )}
                      </div>
                    </div>
                  )}

                  {/* Opening Phase */}
                  {callData.binary_scores.opening && Object.keys(callData.binary_scores.opening).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-md bg-muted px-3 py-2 rounded-md">I. Opening Spiel</h4>
                      <div className="space-y-1">
                        {Object.entries(callData.binary_scores.opening).map(([name, metric]) => 
                          renderMetricRow(name, metric)
                        )}
                      </div>
                    </div>
                  )}

                  {/* Middle Phase */}
                  {callData.binary_scores.middle && Object.keys(callData.binary_scores.middle).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-md bg-muted px-3 py-2 rounded-md">II. Middle / Climax</h4>
                      <div className="space-y-1">
                        {Object.entries(callData.binary_scores.middle).map(([name, metric]) => 
                          renderMetricRow(name, metric)
                        )}
                      </div>
                    </div>
                  )}

                  {/* Closing Phase */}
                  {callData.binary_scores.closing && Object.keys(callData.binary_scores.closing).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-md bg-muted px-3 py-2 rounded-md">III. Closing / Wrap Up</h4>
                      <div className="space-y-1">
                        {Object.entries(callData.binary_scores.closing).map(([name, metric]) => 
                          renderMetricRow(name, metric)
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Speaker Information */}
              {(() => {
                const stats = getAgentStats();
                return stats && (
                  <div>
                    <h3 className="font-semibold text-lg mb-3">Speaker Identification</h3>
                    <div className="grid grid-cols-2 gap-3">
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
      const color = score >= 90 ? 'text-green-600' : 
                    score >= 80 ? 'text-yellow-600' : 
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
      const variants = {
        'completed': 'default',
        'processing': 'secondary',
        'failed': 'destructive'
      }
      return (
        <Badge variant={variants[status] || 'secondary'}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      )
    }
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const recording = row.original
      const [showDeleteDialog, setShowDeleteDialog] = useState(false)
      const [isDeleting, setIsDeleting] = useState(false)

      const handleDownload = async () => {
        try {
          const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
          
          // Fetch audio file
          const audioResponse = await fetch(`${backendUrl}/api/temp-audio/${recording.callId}`)
          
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
          
          toast.success('Recording downloaded successfully!')
        } catch (error) {
          console.error('Download error:', error)
          toast.error('Failed to download recording')
        }
      }

      const handleDelete = async () => {
        setIsDeleting(true)
        try {
          const response = await fetch(API_ENDPOINTS.DELETE_CALL(recording.callId), {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            throw new Error('Failed to delete recording')
          }

          toast.success('Recording deleted successfully')
          setShowDeleteDialog(false)
          window.location.reload()
        } catch (error) {
          console.error('Delete error:', error)
          toast.error('Failed to delete recording')
        } finally {
          setIsDeleting(false)
        }
      }

      const handleCancelDelete = () => {
        if (!isDeleting) {
          setShowDeleteDialog(false)
        }
      }
 
      return (
        <>
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
              <ScoreDetailsDialog callId={recording.callId} />
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download Recording
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Recording
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Recording</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this call evaluation? This action cannot be undone 
                  and will permanently remove the recording and all associated data including scores 
                  and transcripts.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel 
                  disabled={isDeleting}
                  onClick={handleCancelDelete}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault()
                    handleDelete()
                  }}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )
    },
  }
]