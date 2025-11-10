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
      
      // Generate PDF with diarized transcription and CallEval metrics
      const response = await fetch(`${backendUrl}/api/calls/${callId}`)
      if (response.ok) {
        const data = await response.json()
        
        // Dynamic import of jsPDF and autoTable
        const jsPDF = (await import('jspdf')).default
        const autoTable = (await import('jspdf-autotable')).default
        
        const doc = new jsPDF()
        let yPos = 20
        
        // Title
        doc.setFontSize(18)
        doc.setFont(undefined, 'bold')
        doc.text('CALL TRANSCRIPTION WITH SPEAKER IDENTIFICATION', 105, yPos, { align: 'center' })
        yPos += 10
        
        doc.setLineWidth(0.5)
        doc.line(14, yPos, 196, yPos)
        yPos += 10
        
        // Call Information
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('CALL INFORMATION', 14, yPos)
        yPos += 6
        
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.text(`Call ID: ${callId}`, 14, yPos)
        yPos += 5
        doc.text(`Filename: ${audioFilename}`, 14, yPos)
        yPos += 5
        doc.text(`Upload Date: ${data.created_at || 'N/A'}`, 14, yPos)
        yPos += 5
        doc.text(`Duration: ${data.duration || 'N/A'}`, 14, yPos)
        yPos += 5
        doc.text(`Overall Score: ${data.score || 'N/A'}/100`, 14, yPos)
        yPos += 5
        doc.text(`Status: ${data.status || 'N/A'}`, 14, yPos)
        yPos += 8
        
        // Parse speaker roles
        let speakers = {}
        if (data.speakers) {
          if (typeof data.speakers === 'string') {
            try {
              speakers = JSON.parse(data.speakers)
            } catch (e) {
              console.error('Error parsing speakers:', e)
            }
          } else {
            speakers = data.speakers
          }
        }
        
        // Speaker Identification
        if (Object.keys(speakers).length > 0) {
          doc.setFontSize(12)
          doc.setFont(undefined, 'bold')
          doc.text('SPEAKER IDENTIFICATION', 14, yPos)
          yPos += 6
          
          doc.setFontSize(10)
          doc.setFont(undefined, 'normal')
          Object.entries(speakers).forEach(([speakerId, role]) => {
            const icon = role === 'agent' ? 'AGENT' : role === 'caller' ? 'CALLER' : 'UNKNOWN'
            doc.text(`${speakerId}: ${icon}`, 14, yPos)
            yPos += 5
          })
          yPos += 3
        }
        
        // Parse evaluation metrics
        let evaluationMetrics = {}
        if (data.evaluation_results) {
          if (typeof data.evaluation_results === 'string') {
            try {
              evaluationMetrics = JSON.parse(data.evaluation_results)
            } catch (e) {
              console.error('Error parsing evaluation_results:', e)
            }
          } else {
            evaluationMetrics = data.evaluation_results
          }
        }
        
        // Parse binary_scores for comprehensive metrics
        let binaryScores = null
        if (data.binary_scores) {
          if (typeof data.binary_scores === 'string') {
            try {
              binaryScores = JSON.parse(data.binary_scores)
            } catch (e) {
              console.error('Error parsing binary_scores:', e)
            }
          } else {
            binaryScores = data.binary_scores
          }
        }
        
        // Metrics Breakdown - All metrics in one list
        if (binaryScores?.metrics && Object.keys(binaryScores.metrics).length > 0) {
          doc.setFontSize(12)
          doc.setFont(undefined, 'bold')
          doc.text('METRICS BREAKDOWN', 14, yPos)
          yPos += 6
          
          const metricsBreakdownData = Object.entries(binaryScores.metrics).map(([key, metric]) => {
            const detected = metric.detected ? '✓' : '✗'
            const score = metric.weighted_score || 0
            const weight = metric.max_score || metric.weight || 0
            const metricName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            return [detected, metricName, `${score.toFixed(1)}/${weight}`]
          })
          
          if (metricsBreakdownData.length > 0) {
            autoTable(doc, {
              startY: yPos,
              head: [['Status', 'Metric', 'Score']],
              body: metricsBreakdownData,
              theme: 'striped',
              headStyles: { 
                fillColor: [34, 197, 94], 
                textColor: [255, 255, 255], 
                fontStyle: 'bold',
                halign: 'center',
                valign: 'middle',
                fontSize: 10,
                minCellHeight: 8,
                overflow: 'visible'
              },
              styles: { fontSize: 9, cellPadding: 3 },
              columnStyles: {
                0: { cellWidth: 22, halign: 'center', fontStyle: 'bold', overflow: 'visible' },
                1: { cellWidth: 113, halign: 'left' },
                2: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
              },
              didParseCell: function (data) {
                // Align header cells individually
                if (data.section === 'head') {
                  data.cell.styles.valign = 'middle'
                  if (data.column.index === 0) {
                    data.cell.styles.halign = 'center'
                  } else if (data.column.index === 1) {
                    data.cell.styles.halign = 'left'
                  } else if (data.column.index === 2) {
                    data.cell.styles.halign = 'right'
                  }
                }
                // Color the status column in body
                if (data.column.index === 0 && data.cell.section === 'body') {
                  if (data.cell.raw === '✓') {
                    data.cell.styles.textColor = [34, 197, 94] // Green
                  } else if (data.cell.raw === '✗') {
                    data.cell.styles.textColor = [239, 68, 68] // Red
                  }
                }
              }
            })
            yPos = doc.lastAutoTable.finalY + 8
          }
        }
        
        // CallEval Metrics by Phase (if available)
        if (evaluationMetrics && Object.keys(evaluationMetrics).length > 0) {
          // Add new page if needed
          if (yPos > 250) {
            doc.addPage()
            yPos = 20
          }
          
          doc.setFontSize(12)
          doc.setFont(undefined, 'bold')
          doc.text('CALLEVAL METRICS BY PHASE', 14, yPos)
          yPos += 6
          
          const formatPhaseMetrics = (metrics, phaseName) => {
            if (!metrics) return []
            
            const rows = []
            rows.push([{ content: phaseName.toUpperCase(), colSpan: 3, styles: { fontStyle: 'bold', fillColor: [220, 220, 220] } }])
            
            Object.entries(metrics).forEach(([key, metric]) => {
              if (typeof metric === 'object' && metric !== null) {
                const detected = metric.detected ? '✓' : '✗'
                const score = metric.weighted_score || 0
                const weight = metric.weight || 0
                const metricName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                rows.push([detected, metricName, `${score.toFixed(1)}/${weight}`])
              }
            })
            return rows
          }
          
          const metricsData = []
          
          if (evaluationMetrics.all_phases) {
            metricsData.push(...formatPhaseMetrics(evaluationMetrics.all_phases, 'All Phases'))
          }
          if (evaluationMetrics.opening) {
            metricsData.push(...formatPhaseMetrics(evaluationMetrics.opening, 'I. Opening Spiel'))
          }
          if (evaluationMetrics.middle) {
            metricsData.push(...formatPhaseMetrics(evaluationMetrics.middle, 'II. Middle / Climax'))
          }
          if (evaluationMetrics.closing) {
            metricsData.push(...formatPhaseMetrics(evaluationMetrics.closing, 'III. Closing / Wrap Up'))
          }
          
          if (metricsData.length > 0) {
            autoTable(doc, {
              startY: yPos,
              head: [['Status', 'Metric', 'Score']],
              body: metricsData,
              theme: 'grid',
              headStyles: { 
                fillColor: [34, 197, 94], 
                textColor: [255, 255, 255], 
                fontStyle: 'bold',
                fontSize: 10
              },
              styles: { fontSize: 9, cellPadding: 2 },
              columnStyles: {
                0: { cellWidth: 20, halign: 'center' },
                1: { cellWidth: 115, halign: 'left' },
                2: { cellWidth: 35, halign: 'right' }
              },
              didParseCell: function (data) {
                // Align header cells
                if (data.section === 'head') {
                  if (data.column.index === 0) {
                    data.cell.styles.halign = 'center'
                  } else if (data.column.index === 1) {
                    data.cell.styles.halign = 'left'
                  } else if (data.column.index === 2) {
                    data.cell.styles.halign = 'right'
                  }
                }
              }
            })
            yPos = doc.lastAutoTable.finalY + 8
          }
        }
        
        // Parse segments for diarized transcript
        let segments = []
        if (data.segments && Array.isArray(data.segments)) {
          segments = data.segments
        } else if (data.scores && typeof data.scores === 'string') {
          try {
            const scoresData = JSON.parse(data.scores)
            segments = scoresData.segments || []
          } catch (e) {
            console.error('Error parsing segments:', e)
          }
        }
        
        // Add new page for transcript if needed
        if (yPos > 250) {
          doc.addPage()
          yPos = 20
        }
        
        // Diarized Transcript
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('DIARIZED TRANSCRIPT', 14, yPos)
        yPos += 6
        
        if (segments.length > 0) {
          const transcriptData = segments.map(segment => {
            const speakerId = segment.speaker || 'UNKNOWN'
            const role = speakers[speakerId] || 'unknown'
            const roleLabel = role === 'agent' ? 'AGENT' : role === 'caller' ? 'CALLER' : 'UNKNOWN'
            
            const timestamp = segment.start !== undefined && segment.end !== undefined 
              ? `[${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s]`
              : '[--:--]'
            
            return [
              timestamp,
              roleLabel,
              segment.text
            ]
          })
          
          autoTable(doc, {
            startY: yPos,
            head: [['Time', 'Speaker', 'Text']],
            body: transcriptData,
            theme: 'grid',
            headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold' },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
              0: { cellWidth: 30 },
              1: { cellWidth: 25 },
              2: { cellWidth: 125 }
            }
          })
        } else {
          doc.setFontSize(10)
          doc.setFont(undefined, 'normal')
          doc.text('No diarized segments available.', 14, yPos)
        }
        
        // Save the PDF
        doc.save(`${callId}_transcript_with_metrics.pdf`)
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

              {/* Speaker Identification */}
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
                          <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">{stats.agentSpeaker}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-green-100 dark:bg-green-900 px-3 py-2 rounded-md">
                        <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <div>
                          <span className="text-sm font-bold text-green-700 dark:text-green-300">CALLER</span>
                          <span className="text-xs text-green-600 dark:text-green-400 ml-2">{stats.callerSpeaker}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <Separator />

              {/* Transcription */}
              {callData.transcript ? (
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
          {status}
        </Badge>
      )
    }
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const recording = row.original
      
      const handleDownload = async () => {
        try {
          const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
          
          // Download audio with proper filename extraction
          const audioResponse = await fetch(`${backendUrl}/api/temp-audio/${recording.callId}`)
          
          if (!audioResponse.ok) {
            throw new Error('Failed to download audio')
          }
          
          // Extract filename from Content-Disposition header
          let audioFilename = recording.fileName || 'recording.mp3'
          const contentDisposition = audioResponse.headers.get('Content-Disposition')
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
            if (filenameMatch && filenameMatch[1]) {
              audioFilename = filenameMatch[1].replace(/['"]/g, '')
            }
          }
          
          // Download audio blob
          const audioBlob = await audioResponse.blob()
          const audioUrl = window.URL.createObjectURL(audioBlob)
          const audioLink = document.createElement('a')
          audioLink.href = audioUrl
          audioLink.download = audioFilename
          document.body.appendChild(audioLink)
          audioLink.click()
          document.body.removeChild(audioLink)
          window.URL.revokeObjectURL(audioUrl)
          
          // Generate PDF with diarized transcription and CallEval metrics
          const response = await fetch(`${backendUrl}/api/calls/${recording.callId}`)
          if (response.ok) {
            const data = await response.json()
            
            // Dynamic import of jsPDF and autoTable
            const jsPDF = (await import('jspdf')).default
            const autoTable = (await import('jspdf-autotable')).default
            
            const doc = new jsPDF()
            let yPos = 20
            
            // Title
            doc.setFontSize(18)
            doc.setFont(undefined, 'bold')
            doc.text('CALL TRANSCRIPTION WITH SPEAKER IDENTIFICATION', 105, yPos, { align: 'center' })
            yPos += 10
            
            doc.setLineWidth(0.5)
            doc.line(14, yPos, 196, yPos)
            yPos += 10
            
            // Call Information
            doc.setFontSize(12)
            doc.setFont(undefined, 'bold')
            doc.text('CALL INFORMATION', 14, yPos)
            yPos += 6
            
            doc.setFontSize(10)
            doc.setFont(undefined, 'normal')
            doc.text(`Call ID: ${recording.callId}`, 14, yPos)
            yPos += 5
            doc.text(`Filename: ${audioFilename}`, 14, yPos)
            yPos += 5
            doc.text(`Upload Date: ${recording.dateOrTime}`, 14, yPos)
            yPos += 5
            doc.text(`Duration: ${data.duration || 'N/A'}`, 14, yPos)
            yPos += 5
            doc.text(`Overall Score: ${data.score || 'N/A'}/100`, 14, yPos)
            yPos += 5
            doc.text(`Status: ${data.status || 'N/A'}`, 14, yPos)
            yPos += 8
            
            // Parse speaker roles
            let speakers = {}
            if (data.speakers) {
              if (typeof data.speakers === 'string') {
                try {
                  speakers = JSON.parse(data.speakers)
                } catch (e) {
                  console.error('Error parsing speakers:', e)
                }
              } else {
                speakers = data.speakers
              }
            }
            
            // Speaker Identification
            if (Object.keys(speakers).length > 0) {
              doc.setFontSize(12)
              doc.setFont(undefined, 'bold')
              doc.text('SPEAKER IDENTIFICATION', 14, yPos)
              yPos += 6
              
              doc.setFontSize(10)
              doc.setFont(undefined, 'normal')
              Object.entries(speakers).forEach(([speakerId, role]) => {
                const icon = role === 'agent' ? 'AGENT' : role === 'caller' ? 'CALLER' : 'UNKNOWN'
                doc.text(`${speakerId}: ${icon}`, 14, yPos)
                yPos += 5
              })
              yPos += 3
            }
            
            // Parse evaluation metrics
            let evaluationMetrics = {}
            if (data.evaluation_results) {
              if (typeof data.evaluation_results === 'string') {
                try {
                  evaluationMetrics = JSON.parse(data.evaluation_results)
                } catch (e) {
                  console.error('Error parsing evaluation_results:', e)
                }
              } else {
                evaluationMetrics = data.evaluation_results
              }
            }
            
            // Parse binary_scores for comprehensive metrics
            let binaryScores = null
            if (data.binary_scores) {
              if (typeof data.binary_scores === 'string') {
                try {
                  binaryScores = JSON.parse(data.binary_scores)
                } catch (e) {
                  console.error('Error parsing binary_scores:', e)
                }
              } else {
                binaryScores = data.binary_scores
              }
            }
            
            // Metrics Breakdown - All metrics in one list
            if (binaryScores?.metrics && Object.keys(binaryScores.metrics).length > 0) {
              doc.setFontSize(12)
              doc.setFont(undefined, 'bold')
              doc.text('METRICS BREAKDOWN', 14, yPos)
              yPos += 6
              
              const metricsBreakdownData = Object.entries(binaryScores.metrics).map(([key, metric]) => {
                const detected = metric.detected ? '✓' : '✗'
                const score = metric.weighted_score || 0
                const weight = metric.max_score || metric.weight || 0
                const metricName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                return [detected, metricName, `${score.toFixed(1)}/${weight}`]
              })
              
              if (metricsBreakdownData.length > 0) {
                autoTable(doc, {
                  startY: yPos,
                  head: [['Status', 'Metric', 'Score']],
                  body: metricsBreakdownData,
                  theme: 'striped',
                  headStyles: { 
                    fillColor: [34, 197, 94], 
                    textColor: [255, 255, 255], 
                    fontStyle: 'bold',
                    halign: 'center',
                    valign: 'middle',
                    fontSize: 10,
                    minCellHeight: 8,
                    overflow: 'visible'
                  },
                  styles: { fontSize: 9, cellPadding: 3 },
                  columnStyles: {
                    0: { cellWidth: 22, halign: 'center', fontStyle: 'bold', overflow: 'visible' },
                    1: { cellWidth: 113, halign: 'left' },
                    2: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
                  },
                  didParseCell: function (data) {
                    // Align header cells individually
                    if (data.section === 'head') {
                      data.cell.styles.valign = 'middle'
                      if (data.column.index === 0) {
                        data.cell.styles.halign = 'center'
                      } else if (data.column.index === 1) {
                        data.cell.styles.halign = 'left'
                      } else if (data.column.index === 2) {
                        data.cell.styles.halign = 'right'
                      }
                    }
                    // Color the status column in body
                    if (data.column.index === 0 && data.cell.section === 'body') {
                      if (data.cell.raw === '✓') {
                        data.cell.styles.textColor = [34, 197, 94] // Green
                      } else if (data.cell.raw === '✗') {
                        data.cell.styles.textColor = [239, 68, 68] // Red
                      }
                    }
                  }
                })
                yPos = doc.lastAutoTable.finalY + 8
              }
            }
            
            // CallEval Metrics by Phase (if available)
            if (evaluationMetrics && Object.keys(evaluationMetrics).length > 0) {
              // Add new page if needed
              if (yPos > 250) {
                doc.addPage()
                yPos = 20
              }
              
              doc.setFontSize(12)
              doc.setFont(undefined, 'bold')
              doc.text('CALLEVAL METRICS BY PHASE', 14, yPos)
              yPos += 6
              
              const formatPhaseMetrics = (metrics, phaseName) => {
                if (!metrics) return []
                
                const rows = []
                rows.push([{ content: phaseName.toUpperCase(), colSpan: 3, styles: { fontStyle: 'bold', fillColor: [220, 220, 220] } }])
                
                Object.entries(metrics).forEach(([key, metric]) => {
                  if (typeof metric === 'object' && metric !== null) {
                    const detected = metric.detected ? '✓' : '✗'
                    const score = metric.weighted_score || 0
                    const weight = metric.weight || 0
                    const metricName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                    rows.push([detected, metricName, `${score.toFixed(1)}/${weight}`])
                  }
                })
                return rows
              }
              
              const metricsData = []
              
              if (evaluationMetrics.all_phases) {
                metricsData.push(...formatPhaseMetrics(evaluationMetrics.all_phases, 'All Phases'))
              }
              if (evaluationMetrics.opening) {
                metricsData.push(...formatPhaseMetrics(evaluationMetrics.opening, 'I. Opening Spiel'))
              }
              if (evaluationMetrics.middle) {
                metricsData.push(...formatPhaseMetrics(evaluationMetrics.middle, 'II. Middle / Climax'))
              }
              if (evaluationMetrics.closing) {
                metricsData.push(...formatPhaseMetrics(evaluationMetrics.closing, 'III. Closing / Wrap Up'))
              }
              
              if (metricsData.length > 0) {
                autoTable(doc, {
                  startY: yPos,
                  head: [['Status', 'Metric', 'Score']],
                  body: metricsData,
                  theme: 'grid',
                  headStyles: { 
                    fillColor: [34, 197, 94], 
                    textColor: [255, 255, 255], 
                    fontStyle: 'bold',
                    fontSize: 10
                  },
                  styles: { fontSize: 9, cellPadding: 2 },
                  columnStyles: {
                    0: { cellWidth: 15, halign: 'center' },
                    1: { cellWidth: 120, halign: 'left' },
                    2: { cellWidth: 35, halign: 'right' }
                  },
                  didParseCell: function (data) {
                    // Align header cells
                    if (data.section === 'head') {
                      if (data.column.index === 0) {
                        data.cell.styles.halign = 'center'
                      } else if (data.column.index === 1) {
                        data.cell.styles.halign = 'left'
                      } else if (data.column.index === 2) {
                        data.cell.styles.halign = 'right'
                      }
                    }
                  }
                })
                yPos = doc.lastAutoTable.finalY + 8
              }
            }
            
            // Parse segments for diarized transcript
            let segments = []
            if (data.segments && Array.isArray(data.segments)) {
              segments = data.segments
            } else if (data.scores && typeof data.scores === 'string') {
              try {
                const scoresData = JSON.parse(data.scores)
                segments = scoresData.segments || []
              } catch (e) {
                console.error('Error parsing segments:', e)
              }
            }
            
            // Add new page for transcript if needed
            if (yPos > 250) {
              doc.addPage()
              yPos = 20
            }
            
            // Diarized Transcript
            doc.setFontSize(12)
            doc.setFont(undefined, 'bold')
            doc.text('DIARIZED TRANSCRIPT', 14, yPos)
            yPos += 6
            
            if (segments.length > 0) {
              const transcriptData = segments.map(segment => {
                const speakerId = segment.speaker || 'UNKNOWN'
                const role = speakers[speakerId] || 'unknown'
                const roleLabel = role === 'agent' ? 'AGENT' : role === 'caller' ? 'CALLER' : 'UNKNOWN'
                
                const timestamp = segment.start !== undefined && segment.end !== undefined 
                  ? `[${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s]`
                  : '[--:--]'
                
                return [
                  timestamp,
                  roleLabel,
                  segment.text
                ]
              })
              
              autoTable(doc, {
                startY: yPos,
                head: [['Time', 'Speaker', 'Text']],
                body: transcriptData,
                theme: 'grid',
                headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold' },
                styles: { fontSize: 8, cellPadding: 2 },
                columnStyles: {
                  0: { cellWidth: 30 },
                  1: { cellWidth: 25 },
                  2: { cellWidth: 125 }
                }
              })
            } else {
              doc.setFontSize(10)
              doc.setFont(undefined, 'normal')
              doc.text('No diarized segments available.', 14, yPos)
            }
            
            // Save the PDF
            doc.save(`${recording.callId}_transcript_with_metrics.pdf`)
          }
          
          toast.success('Files downloaded successfully!')
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
            <ScoreDetailsDialog callId={recording.callId} />
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