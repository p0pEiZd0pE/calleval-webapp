import { Download, Eye, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

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
      
      // Safe string capitalization with null check
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
        classified: "default",
        pending: "secondary",
        processing: "secondary",
        transcribing: "secondary",
        analyzing: "secondary",
        analyzing_bert: "secondary",
        analyzing_wav2vec2: "secondary",
        failed: "destructive"
      };
      
      // Safe string capitalization with null check
      const displayStatus = status ? 
        status.charAt(0).toUpperCase() + status.slice(1) : 
        "Pending";
      
      return (
        <Badge variant={variants[status] || "secondary"}>
          {(status === "processing" || status === "analyzing" || 
            status === "transcribing" || status === "analyzing_bert" || 
            status === "analyzing_wav2vec2") && (
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
      
      const handleView = () => {
        // Navigate to call details page
        console.log("View call:", call.id);
        // TODO: Implement navigation to details page
        // For now, show alert with call info
        alert(`Call ID: ${call.id}\nStatus: ${call.status}\nFilename: ${call.fileName}`);
      };
      
      const handleDownload = () => {
        // Use the API_ENDPOINTS if available, otherwise construct URL
        const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        window.open(`${backendUrl}/api/temp-audio/${call.id}`, '_blank');
      };
 
      return (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={handleView}
            title="View Details"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={handleDownload}
            title="Download Audio"
            disabled={call.status === "pending" || call.status === "processing"}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      );
    },
  }
];