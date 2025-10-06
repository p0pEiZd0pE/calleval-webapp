import * as React from "react"
import { Download, SquarePen, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

export const columns = [
  {
    accessorKey: "userId",
    header: "User ID",
  },
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => {
      const user = row.original
      const [value, setValue] = React.useState(user.role)

      const handleChange = (newRole) => {
        setValue(newRole)
        console.log(`Changed role for ${user.id} to ${newRole}`)
        // Optional: call API or update global state here
      }

      return (
        <Select value={value} onValueChange={handleChange}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Admin">Admin</SelectItem>
            <SelectItem value="Supervisor">Supervisor</SelectItem>
            <SelectItem value="Viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      )
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const rawRecordings = row.original
 
      return (
            <div>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <SquarePen />
              </Button>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <Trash2 />
              </Button>
            </div>
      )
    },
  }
];
