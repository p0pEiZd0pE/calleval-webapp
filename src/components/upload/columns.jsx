import { Download, Eye, Loader2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CallDetailsDialog } from "./call-details-dialog"
import { useState } from "react"
import { API_ENDPOINTS } from '@/config/api'
import { toast } from "sonner"

export const columns = [
  {
    accessorKey: "fileName",
    header: "File Name",
  },
  {
    accessorKey: "uploadDate",
    header: "Upload Date",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") || "pending";
      
      const variants = {
        completed: "default",
        cancelled: "secondary",
        pending: "secondary",
        processing: "secondary",
        transcribing: "secondary",
        analyzing: "secondary",
        failed: "destructive"
      };
      
      const displayStatus = status ? 
        status.charAt(0).toUpperCase() + status.slice(1) : 
        "Pending";
      
      return (
        <Badge variant={variants[status] || "secondary"}>
          {(status === "transcribing" || status === "analyzing" || status === "processing") && (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          )}
          {displayStatus}
        </Badge>
      );
    },
  },
  {
    accessorKey: "analysisStatus",
    header: "Analysis Status",
    cell: ({ row }) => {
      const status = row.getValue("analysisStatus") || "pending";
      
      const variants = {
        completed: "default",
        transcribed: "default",
        classified: "default",
        cancelled: "secondary",
        pending: "secondary",
        processing: "secondary",
        transcribing: "secondary",
        analyzing: "secondary",
        analyzing_bert: "secondary",
        analyzing_wav2vec2: "secondary",
        queued: "secondary",
        failed: "destructive"
      };
      
      const displayStatus = status ? 
        status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : 
        "Pending";
      
      return (
        <Badge variant={variants[status] || "secondary"}>
          {(status === "processing" || status === "analyzing" || 
            status === "transcribing" || status === "analyzing_bert" || 
            status === "analyzing_wav2vec2" || status === "queued") && (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          )}
          {displayStatus}
        </Badge>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const call = row.original;
      const [dialogOpen, setDialogOpen] = useState(false);
      const [cancelling, setCancelling] = useState(false);
      
      // Check if call is currently processing
      const isProcessing = [
        'processing', 'transcribing', 'analyzing', 
        'analyzing_bert', 'analyzing_wav2vec2', 'queued'
      ].includes(call.status) || [
        'processing', 'transcribing', 'analyzing',
        'analyzing_bert', 'analyzing_wav2vec2', 'queued'
      ].includes(call.analysisStatus);

      const handleCancel = async () => {
        if (!window.confirm('Are you sure you want to cancel this processing? This action cannot be undone.')) {
          return;
        }

        setCancelling(true);
        try {
          const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
          const response = await fetch(`${backendUrl}/api/calls/${call.id}/cancel`, {
            method: 'POST',
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to cancel processing');
          }

          toast.success('Processing cancelled successfully');
          
          // Refresh the page or trigger a refetch
          window.location.reload();
        } catch (error) {
          console.error('Cancel error:', error);
          toast.error(error.message || 'Failed to cancel processing');
        } finally {
          setCancelling(false);
        }
      };
      
      const handleDownload = async () => {
        try {
          const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
          
          // Download audio with proper filename extraction
          const audioResponse = await fetch(`${backendUrl}/api/temp-audio/${call.id}`);
          
          if (!audioResponse.ok) {
            throw new Error('Failed to download audio');
          }
          
          // Extract filename from Content-Disposition header
          let audioFilename = call.fileName || 'recording.mp3';
          const contentDisposition = audioResponse.headers.get('Content-Disposition');
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch && filenameMatch[1]) {
              audioFilename = filenameMatch[1].replace(/['"]/g, '');
            }
          }
          
          // Download audio blob
          const audioBlob = await audioResponse.blob();
          const audioUrl = window.URL.createObjectURL(audioBlob);
          const audioLink = document.createElement('a');
          audioLink.href = audioUrl;
          audioLink.download = audioFilename;
          document.body.appendChild(audioLink);
          audioLink.click();
          document.body.removeChild(audioLink);
          window.URL.revokeObjectURL(audioUrl);
          
          // Download diarized transcription with CallEval metrics
          const response = await fetch(`${backendUrl}/api/calls/${call.id}`);
          if (response.ok) {
            const data = await response.json();
            
            // Parse segments for diarized transcript
            let segments = [];
            if (data.segments && Array.isArray(data.segments)) {
              segments = data.segments;
            } else if (data.scores && typeof data.scores === 'string') {
              try {
                const scoresData = JSON.parse(data.scores);
                segments = scoresData.segments || [];
              } catch (e) {
                console.error('Error parsing segments:', e);
              }
            }
            
            // Parse speaker roles
            let speakers = {};
            if (data.speakers) {
              if (typeof data.speakers === 'string') {
                try {
                  speakers = JSON.parse(data.speakers);
                } catch (e) {
                  console.error('Error parsing speakers:', e);
                }
              } else {
                speakers = data.speakers;
              }
            }
            
            // Parse evaluation metrics
            let evaluationMetrics = {};
            if (data.evaluation_results) {
              if (typeof data.evaluation_results === 'string') {
                try {
                  evaluationMetrics = JSON.parse(data.evaluation_results);
                } catch (e) {
                  console.error('Error parsing evaluation_results:', e);
                }
              } else {
                evaluationMetrics = data.evaluation_results;
              }
            }
            
            // Build formatted transcription
            let transcriptText = '';
            
            // Header Section
            transcriptText += `${'='.repeat(80)}\n`;
            transcriptText += `               CALL TRANSCRIPTION WITH SPEAKER IDENTIFICATION\n`;
            transcriptText += `${'='.repeat(80)}\n\n`;
            
            // Call Information
            transcriptText += `CALL INFORMATION:\n`;
            transcriptText += `${'-'.repeat(80)}\n`;
            transcriptText += `Call ID       : ${call.id}\n`;
            transcriptText += `Filename      : ${audioFilename}\n`;
            transcriptText += `Upload Date   : ${call.uploadDate}\n`;
            transcriptText += `Duration      : ${data.duration || 'N/A'}\n`;
            transcriptText += `Overall Score : ${data.score || 'N/A'}/100\n`;
            transcriptText += `Status        : ${data.status || 'N/A'}\n\n`;
            
            // Speaker Identification
            if (Object.keys(speakers).length > 0) {
              transcriptText += `SPEAKER IDENTIFICATION:\n`;
              transcriptText += `${'-'.repeat(80)}\n`;
              Object.entries(speakers).forEach(([speakerId, role]) => {
                const icon = role === 'agent' ? '👤 AGENT' : role === 'caller' ? '📞 CALLER' : '❓ UNKNOWN';
                transcriptText += `${speakerId.padEnd(15)} : ${icon}\n`;
              });
              transcriptText += `\n`;
            }
            
            // CallEval Metrics (if available)
            if (evaluationMetrics && Object.keys(evaluationMetrics).length > 0) {
              transcriptText += `CALLEVAL METRICS:\n`;
              transcriptText += `${'-'.repeat(80)}\n`;
              
              // Function to format metrics by phase
              const formatPhaseMetrics = (metrics, phaseName) => {
                if (!metrics) return '';
                
                let phaseText = `\n${phaseName.toUpperCase()}:\n`;
                Object.entries(metrics).forEach(([key, metric]) => {
                  if (typeof metric === 'object' && metric !== null) {
                    const detected = metric.detected ? '✓' : '✗';
                    const score = metric.weighted_score || 0;
                    const weight = metric.weight || 0;
                    phaseText += `  ${detected} ${key.replace(/_/g, ' ').padEnd(35)} : ${score.toFixed(1)}/${weight}\n`;
                  }
                });
                return phaseText;
              };
              
              // Display metrics by phase
              if (evaluationMetrics.all_phases) {
                transcriptText += formatPhaseMetrics(evaluationMetrics.all_phases, 'All Phases');
              }
              if (evaluationMetrics.opening) {
                transcriptText += formatPhaseMetrics(evaluationMetrics.opening, 'I. Opening Spiel');
              }
              if (evaluationMetrics.middle) {
                transcriptText += formatPhaseMetrics(evaluationMetrics.middle, 'II. Middle / Climax');
              }
              if (evaluationMetrics.closing) {
                transcriptText += formatPhaseMetrics(evaluationMetrics.closing, 'III. Closing / Wrap Up');
              }
              
              transcriptText += `\n`;
            }
            
            // Diarized Transcript
            transcriptText += `${'='.repeat(80)}\n`;
            transcriptText += `                            DIARIZED TRANSCRIPT\n`;
            transcriptText += `${'='.repeat(80)}\n\n`;
            
            if (segments.length > 0) {
              segments.forEach((segment, index) => {
                const speakerId = segment.speaker || 'UNKNOWN';
                const role = speakers[speakerId] || 'unknown';
                const roleLabel = role === 'agent' ? '👤 AGENT' : 
                                role === 'caller' ? '📞 CALLER' : 
                                '❓ UNKNOWN';
                
                const timestamp = segment.start !== undefined && segment.end !== undefined 
                  ? `[${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s]`
                  : '';
                
                transcriptText += `${roleLabel} ${speakerId} ${timestamp}:\n`;
                transcriptText += `${segment.text || ''}\n\n`;
              });
            } else {
              transcriptText += 'No transcript segments available.\n';
            }
            
            transcriptText += `${'='.repeat(80)}\n`;
            transcriptText += `END OF TRANSCRIPT\n`;
            transcriptText += `${'='.repeat(80)}\n`;
            
            // Download transcript
            const transcriptBlob = new Blob([transcriptText], { type: 'text/plain' });
            const transcriptUrl = window.URL.createObjectURL(transcriptBlob);
            const transcriptLink = document.createElement('a');
            transcriptLink.href = transcriptUrl;
            transcriptLink.download = `${call.id}_transcript.txt`;
            document.body.appendChild(transcriptLink);
            transcriptLink.click();
            document.body.removeChild(transcriptLink);
            window.URL.revokeObjectURL(transcriptUrl);
          }
          
          toast.success('Files downloaded successfully!');
        } catch (error) {
          console.error('Download error:', error);
          toast.error('Failed to download files');
        }
      };
      
      return (
        <div className="flex items-center gap-1">
          <CallDetailsDialog 
            call={call}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDialogOpen(true)}
            title="View call details"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            disabled={call.status !== 'completed'}
            title="Download recording and transcript"
          >
            <Download className="h-4 w-4" />
          </Button>
          {isProcessing && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              disabled={cancelling}
              title="Cancel processing"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {cancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      );
    },
  },
];