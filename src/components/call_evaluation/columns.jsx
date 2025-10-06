import { MoreHorizontal } from "lucide-react"
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
    accessorKey: "callId",
    header: "Call Id",
  },
  {
    accessorKey: "agentName",
    header: "Agent Name",
  },
  {
    accessorKey: "dateOrTime",
    header: "Date or Time",
  },
  {
    accessorKey: "duration",
    header: "Duration",
  },
  {
    accessorKey: "classification",
    header: "Classification",
  },
  {
    accessorKey: "tone",
    header: "Tone",
    cell: ({ getValue }) => `${getValue()}%`,
  },
  {
    accessorKey: "script",
    header: "Script",
    cell: ({ getValue }) => `${getValue()}%`,
  },
  {
    accessorKey: "resolution",
    header: "Resolution",
    cell: ({ getValue }) => `${getValue()}%`,
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const recordings = row.original
 
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
            <DropdownMenuItem>Play Recording</DropdownMenuItem>
            <DropdownMenuItem>Download Recording</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  }
];
