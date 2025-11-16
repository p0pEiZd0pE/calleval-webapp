import * as React from "react"
import { SquarePen, Trash2, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { API_URL } from '@/config/api'
import { authenticatedFetch } from '@/lib/api'
import { toast } from 'sonner'

// Edit User Dialog Component
const EditUserDialog = ({ user, open, onOpenChange, onSuccess }) => {
  const [editData, setEditData] = React.useState({
    full_name: user.full_name || '',
    username: user.username || '',
    email: user.email || '',
    role: user.role || 'Agent',
    is_active: user.is_active !== false
  })

  React.useEffect(() => {
    if (user) {
      setEditData({
        full_name: user.full_name || '',
        username: user.username || '',
        email: user.email || '',
        role: user.role || 'Agent',
        is_active: user.is_active !== false
      })
    }
  }, [user])

  const handleUpdate = async () => {
    try {
      const response = await authenticatedFetch(`${API_URL}/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      })

      if (response.ok) {
        toast.success('User updated successfully')
        onOpenChange(false)
        onSuccess()
      } else {
        const errorData = await response.json()
        toast.error(errorData.detail || 'Failed to update user')
      }
    } catch (error) {
      console.error('Update user error:', error)
      toast.error('Failed to update user')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update user information and permissions
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit_full_name">Full Name</Label>
            <Input
              id="edit_full_name"
              value={editData.full_name}
              onChange={(e) => setEditData({...editData, full_name: e.target.value})}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit_username">Username</Label>
            <Input
              id="edit_username"
              value={editData.username}
              onChange={(e) => setEditData({...editData, username: e.target.value})}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit_email">Email</Label>
            <Input
              id="edit_email"
              type="email"
              value={editData.email}
              onChange={(e) => setEditData({...editData, email: e.target.value})}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit_role">Role</Label>
            <Select 
              value={editData.role} 
              onValueChange={(val) => setEditData({...editData, role: val})}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Manager">Manager</SelectItem>
                <SelectItem value="Agent">Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpdate}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Reset Password Dialog Component
const ResetPasswordDialog = ({ user, open, onOpenChange }) => {
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')

  const handleResetPassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    try {
      const response = await authenticatedFetch(`${API_URL}/api/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword }),
      })

      if (response.ok) {
        toast.success('Password reset successfully')
        onOpenChange(false)
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const errorData = await response.json()
        toast.error(errorData.detail || 'Failed to reset password')
      }
    } catch (error) {
      console.error('Reset password error:', error)
      toast.error('Failed to reset password')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            Set a new password for {user.full_name || user.username}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="new_password">New Password</Label>
            <Input
              id="new_password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm_new_password">Confirm Password</Label>
            <Input
              id="confirm_new_password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleResetPassword}>Reset Password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Delete User Dialog Component
const DeleteUserDialog = ({ user, open, onOpenChange, onSuccess }) => {
  const [deleting, setDeleting] = React.useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const response = await authenticatedFetch(`${API_URL}/api/users/${user.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success('User deleted successfully')
        onOpenChange(false)
        onSuccess()
      } else {
        const errorData = await response.json()
        toast.error(errorData.detail || 'Failed to delete user')
      }
    } catch (error) {
      console.error('Delete user error:', error)
      toast.error('Failed to delete user')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the user <strong>{user.full_name || user.username}</strong>.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export const columns = [
  {
    accessorKey: "id",
    header: "User ID",
    cell: ({ row }) => {
      const id = row.getValue("id")
      return <span className="font-mono text-xs">{id.substring(0, 8)}...</span>
    }
  },
  {
    accessorKey: "full_name",
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
      const role = row.getValue("role")
      const variant = role === 'Admin' ? 'destructive' : role === 'Manager' ? 'default' : 'secondary'
      return <Badge variant={variant}>{role}</Badge>
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const user = row.original
      const [editOpen, setEditOpen] = React.useState(false)
      const [resetPasswordOpen, setResetPasswordOpen] = React.useState(false)
      const [deleteOpen, setDeleteOpen] = React.useState(false)
      
      // Callback to refresh data (will be passed from parent component)
      const onSuccess = () => {
        if (row.table.options.meta?.refreshData) {
          row.table.options.meta.refreshData()
        }
      }
 
      return (
        <>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              className="h-8 w-8 p-0"
              onClick={() => setEditOpen(true)}
            >
              <SquarePen className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              className="h-8 w-8 p-0"
              onClick={() => setResetPasswordOpen(true)}
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <EditUserDialog 
            user={user}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSuccess={onSuccess}
          />

          <ResetPasswordDialog 
            user={user}
            open={resetPasswordOpen}
            onOpenChange={setResetPasswordOpen}
          />

          <DeleteUserDialog 
            user={user}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onSuccess={onSuccess}
          />
        </>
      )
    },
  }
]