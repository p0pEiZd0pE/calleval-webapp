import React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Edit, Lock } from "lucide-react"
import { columns } from '@/components/settings/columns'
import { DataTable } from '@/components/settings/data-table'
import { API_URL } from '@/config/api'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { authenticatedFetch } from '@/lib/api';

export default function UserAccessControl() {
  const [data, setData] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [newUser, setNewUser] = React.useState({
    full_name: '',
    username: '',
    email: '',
    password: '',
    role: 'Agent',
  })
  
  // Admin profile state
  const [currentUser, setCurrentUser] = React.useState(null)
  const [isEditProfileOpen, setIsEditProfileOpen] = React.useState(false)
  const [isChangePasswordOpen, setIsChangePasswordOpen] = React.useState(false)
  const [profileData, setProfileData] = React.useState({
    full_name: '',
    email: '',
    username: ''
  })
  const [passwordData, setPasswordData] = React.useState({
    old_password: '',
    new_password: '',
    confirm_password: ''
  })
  
  React.useEffect(() => {
    fetchCurrentUser()
    fetchUsers()
  }, [])

  const fetchCurrentUser = async () => {
    try {
      const response = await authenticatedFetch(`${API_URL}/api/auth/me`)
      if (response.ok) {
        const user = await response.json()
        setCurrentUser(user)
        setProfileData({
          full_name: user.full_name,
          email: user.email,
          username: user.username
        })
      }
    } catch (error) {
      console.error('Failed to fetch current user:', error)
    }
  }

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const response = await authenticatedFetch(`${API_URL}/api/users`)
      if (response.ok) {
        const users = await response.json()
        // Filter out the current admin user from the table
        const filteredUsers = users.filter(user => user.id !== currentUser?.id)
        setData(filteredUsers)
      } else {
        toast.error('Failed to load users')
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async () => {
    if (!newUser.full_name || !newUser.username || !newUser.email || !newUser.password) {
      toast.error('Please fill in all fields')
      return
    }

    if (newUser.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    try {
      const response = await authenticatedFetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })

      if (response.ok) {
        toast.success('User added successfully')
        setIsDialogOpen(false)
        setNewUser({ full_name: '', username: '', email: '', password: '', role: 'Agent' })
        fetchUsers()
      } else {
        const errorData = await response.json()
        toast.error(errorData.detail || 'Failed to add user')
      }
    } catch (error) {
      console.error('Add user error:', error)
      toast.error('Failed to add user')
    }
  }

  const handleUpdateProfile = async () => {
    try {
      const response = await authenticatedFetch(`${API_URL}/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData),
      })

      if (response.ok) {
        toast.success('Profile updated successfully')
        setIsEditProfileOpen(false)
        fetchCurrentUser()
      } else {
        throw new Error('Failed to update profile')
      }
    } catch (error) {
      console.error('Update profile error:', error)
      toast.error('Failed to update profile')
    }
  }

  const handleChangePassword = async () => {
    if (passwordData.new_password !== passwordData.confirm_password) {
      toast.error('New passwords do not match')
      return
    }

    if (passwordData.new_password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    try {
      const response = await authenticatedFetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_password: passwordData.old_password,
          new_password: passwordData.new_password
        }),
      })

      if (response.ok) {
        toast.success('Password changed successfully')
        setIsChangePasswordOpen(false)
        setPasswordData({ old_password: '', new_password: '', confirm_password: '' })
      } else {
        const errorData = await response.json()
        toast.error(errorData.detail || 'Failed to change password')
      }
    } catch (error) {
      console.error('Change password error:', error)
      toast.error('Failed to change password')
    }
  }

  return (
    <>
      {/* Admin Profile Section */}
      {currentUser && (
        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My Profile</CardTitle>
                <CardDescription>
                  View and manage your account information
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Dialog open={isChangePasswordOpen} onOpenChange={setIsChangePasswordOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Lock className="mr-2 h-4 w-4" />
                      Change Password
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Change Password</DialogTitle>
                      <DialogDescription>
                        Update your account password
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="old_password">Current Password</Label>
                        <Input
                          id="old_password"
                          type="password"
                          value={passwordData.old_password}
                          onChange={(e) => setPasswordData({...passwordData, old_password: e.target.value})}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="new_password">New Password</Label>
                        <Input
                          id="new_password"
                          type="password"
                          value={passwordData.new_password}
                          onChange={(e) => setPasswordData({...passwordData, new_password: e.target.value})}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="confirm_password">Confirm New Password</Label>
                        <Input
                          id="confirm_password"
                          type="password"
                          value={passwordData.confirm_password}
                          onChange={(e) => setPasswordData({...passwordData, confirm_password: e.target.value})}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsChangePasswordOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleChangePassword}>Update Password</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                
                <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Profile
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit Profile</DialogTitle>
                      <DialogDescription>
                        Update your profile information
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="full_name">Full Name</Label>
                        <Input
                          id="full_name"
                          value={profileData.full_name}
                          onChange={(e) => setProfileData({...profileData, full_name: e.target.value})}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={profileData.email}
                          onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="username">Username</Label>
                        <Input
                          id="username"
                          value={profileData.username}
                          onChange={(e) => setProfileData({...profileData, username: e.target.value})}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsEditProfileOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleUpdateProfile}>Save Changes</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Full Name</p>
                  <p className="text-sm">{currentUser.full_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Email</p>
                  <p className="text-sm">{currentUser.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Username</p>
                  <p className="text-sm">{currentUser.username}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Role</p>
                  <p className="text-sm">
                    <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                      {currentUser.role}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* User Management Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Define and manage roles and permissions for CallEval users.
              </CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New User</DialogTitle>
                  <DialogDescription>
                    Create a new user account with role assignment.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      value={newUser.full_name}
                      onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={newUser.username}
                      onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                      placeholder="johndoe"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                      placeholder="john@example.com"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                      placeholder="Minimum 6 characters"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="role">Role</Label>
                    <Select 
                      value={newUser.role} 
                      onValueChange={(val) => setNewUser({...newUser, role: val})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
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
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddUser}>Add User</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading users...
            </div>
          ) : (
            <DataTable 
              columns={columns} 
              data={data}
              meta={{
                refreshData: fetchUsers
              }}
            />
          )}
        </CardContent>
      </Card>
    </>
  )
}