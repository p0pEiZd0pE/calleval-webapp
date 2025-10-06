import { Download, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
  },
  {
    accessorKey: "analysisStatus",
    header: "Analysis Status",
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const rawRecordings = row.original
 
      return (
        <div>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <Eye />
          </Button>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <Download />
          </Button>
        </div>
      )
    },
  }
];
