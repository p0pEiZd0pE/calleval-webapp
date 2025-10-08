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
      const status = row.getValue("status");
      
      const variants = {
        completed: "default",
        pending: "secondary",
        transcribing: "secondary",
        failed: "destructive"
      };
      
      return (
        <Badge variant={variants[status] || "secondary"}>
          {status === "transcribing" && (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          )}
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      );
    },
  },
  {
    accessorKey: "analysisStatus",
    header: "Analysis Status",
    cell: ({ row }) => {
      const status = row.getValue("analysisStatus");
      
      const variants = {
        classified: "default",
        pending: "secondary",
        processing: "secondary",
        failed: "destructive"
      };
      
      return (
        <Badge variant={variants[status] || "secondary"}>
          {status === "processing" && (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          )}
          {status.charAt(0).toUpperCase() + status.slice(1)}
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
        // Navigate to call details page (you can implement this later)
        console.log("View call:", call.id);
      };
      
      const handleDownload = () => {
        // Download audio file
        window.open(`http://localhost:8000/api/calls/${call.id}/download`, '_blank');
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
            disabled={call.status === "pending"}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      );
    },
  }
];