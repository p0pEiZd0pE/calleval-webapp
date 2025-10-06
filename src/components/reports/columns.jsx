import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

export const columns = [
  {
    accessorKey: "type",
    header: "Type",
  },
  {
    accessorKey: "dateGenerated",
    header: "Date Generated",
  },
  {
    accessorKey: "format",
    header: "Format",
  },
  {
    accessorKey: "status",
    header: "Status",
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const rawRecordings = row.original
 
      return (
            <Button variant="ghost" className="h-8 w-8 p-0">
              <Download />
            </Button>
      )
    },
  }
];
