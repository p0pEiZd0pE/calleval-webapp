import { Download, Eye, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CallDetailsDialog } from "./call-details-dialog"
import { useState } from "react"

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
      
      const handleDownload = async () => {
        try {
          const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
          
          // Download audio with proper filename extraction
          const audioResponse = await fetch(`${backendUrl}/api/temp-audio/${call.id}`);
          
          if (!audioResponse.ok) {
            throw new Error('Failed to download audio');
          }
          
          // Extract filename from Content-Disposition header (like Call Evaluations page)
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
          audioLink.download = audioFilename; // Now has proper extension
          document.body.appendChild(audioLink);
          audioLink.click();
          document.body.removeChild(audioLink);
          window.URL.revokeObjectURL(audioUrl);
          
          // Download transcription
          const response = await fetch(`${backendUrl}/api/calls/${call.id}`);
          if (response.ok) {
            const data = await response.json();
            if (data.transcript) {
              // Create formatted transcription with speakers
              let transcriptText = `Call Transcription\n`;
              transcriptText += `Filename: ${call.fileName}\n`;
              transcriptText += `Date: ${call.uploadDate}\n`;
              transcriptText += `Duration: ${data.duration || 'N/A'}\n`;
              transcriptText += `Score: ${data.score || 'N/A'}/100\n\n`;
              transcriptText += `${'='.repeat(60)}\n\n`;
              
              // Parse transcript and add speaker labels
              if (data.speakers) {
                const lines = data.transcript.split('\n');
                lines.forEach(line => {
                  if (line.trim()) {
                    transcriptText += line + '\n';
                  }
                });
              } else {
                transcriptText += data.transcript;
              }
              
              // Create and download transcript file
              const blob = new Blob([transcriptText], { type: 'text/plain' });
              const transcriptUrl = window.URL.createObjectURL(blob);
              const transcriptLink = document.createElement('a');
              transcriptLink.href = transcriptUrl;
              // Use the extracted audio filename for the transcript name
              transcriptLink.download = `transcript_${audioFilename.replace(/\.[^/.]+$/, '')}.txt`;
              document.body.appendChild(transcriptLink);
              transcriptLink.click();
              document.body.removeChild(transcriptLink);
              window.URL.revokeObjectURL(transcriptUrl);
            }
          }
        } catch (error) {
          console.error('Download error:', error);
          alert('Failed to download files. Please try again.');
        }
      };
 
      return (
        <div className="flex gap-1">
          <CallDetailsDialog 
            callId={call.id} 
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          >
            <Button
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => setDialogOpen(true)}
              title="View Details"
              disabled={call.status === "pending" || call.status === "processing"}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </CallDetailsDialog>
          
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={handleDownload}
            title="Download Audio & Transcription"
            disabled={call.status === "pending" || call.status === "processing"}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      );
    },
  }
];