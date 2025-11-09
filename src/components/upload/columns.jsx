import { Download, Eye, Loader2, XCircle, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CallDetailsDialog } from "./call-details-dialog"
import { useState } from "react"
import { API_ENDPOINTS } from '@/config/api'
import { toast } from "sonner"
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
        status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 
        "Pending";
      
      return (
        <Badge variant={variants[status] || "secondary"}>
          {(status === "transcribing" || status === "analyzing" || status === "analyzing_bert" || status === "analyzing_wav2vec2" || status === "processing") && (
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
      const recording = row.original
      const [showDeleteDialog, setShowDeleteDialog] = useState(false)
      const [isDeleting, setIsDeleting] = useState(false)

      const handleDownload = async () => {
        try {
          const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
          
          const response = await fetch(`${backendUrl}/api/temp-audio/${recording.id}`)
          
          if (!response.ok) {
            throw new Error('Failed to fetch audio file')
          }
          
          const contentDisposition = response.headers.get('Content-Disposition')
          let filename = 'recording.mp3'
          
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
            if (filenameMatch && filenameMatch[1]) {
              filename = filenameMatch[1].replace(/['"]/g, '')
            }
          }
          
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
          toast.error('Failed to download audio')
        }
      }

      const handleCancelProcessing = async () => {
        try {
          const response = await fetch(API_ENDPOINTS.CALL_DETAIL(recording.id) + '/cancel', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            throw new Error('Failed to cancel processing')
          }

          toast.success('Call processing cancelled')
          window.location.reload()
        } catch (error) {
          console.error('Cancel error:', error)
          toast.error('Failed to cancel processing')
        }
      }

      const handleRetry = async () => {
        try {
          const response = await fetch(API_ENDPOINTS.CALL_DETAIL(recording.id) + '/retry', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            throw new Error('Failed to retry processing')
          }

          toast.success('Call processing restarted')
          window.location.reload()
        } catch (error) {
          console.error('Retry error:', error)
          toast.error('Failed to retry processing')
        }
      }

      const handleDelete = async () => {
        setIsDeleting(true)
        try {
          const response = await fetch(API_ENDPOINTS.DELETE_CALL(recording.id), {
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

      const isProcessing = ['processing', 'transcribing', 'analyzing', 'analyzing_bert', 'analyzing_wav2vec2'].includes(recording.status)
      const canRetry = ['cancelled', 'failed'].includes(recording.status)

      return (
        <>
          <div className="flex items-center gap-2">
            <CallDetailsDialog callId={recording.id} />
            
            <Button 
              variant="ghost" 
              className="h-8 w-8 p-0"
              onClick={handleDownload}
              title="Download Audio"
            >
              <Download className="h-4 w-4" />
            </Button>

            {isProcessing && (
              <Button 
                variant="ghost" 
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                onClick={handleCancelProcessing}
                title="Cancel Processing"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            )}

            {canRetry && (
              <Button 
                variant="ghost" 
                className="h-8 w-8 p-0"
                onClick={handleRetry}
                title="Retry Processing"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}

            <Button 
              variant="ghost" 
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
              title="Delete Recording"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Recording</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{recording.fileName}"? This action cannot be undone and will permanently remove the recording and all associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
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
  },
]