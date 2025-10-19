import React, { useEffect, useState, useMemo } from 'react'
import { columns } from '@/components/agent/columns'
import { DataTable } from '@/components/agent/data-table'
import { AgentCallsDialog } from './agent-calls-dialog'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Plus, Filter, X, RefreshCw, MoreHorizontal } from 'lucide-react'
import { Badge } from "@/components/ui/badge"
import { API_ENDPOINTS } from '@/config/api'
import { toast } from "sonner"

export default function AgentDirectory({ onAgentSelect, onCallsUpdate }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState(null)
  
  const [filters, setFilters] = useState({
    position: "all",
    status: "all",
    minScore: "",
    maxScore: "",
    minCalls: "",
    maxCalls: ""
  })
  
  const [newAgent, setNewAgent] = useState({
    agentName: "",
    position: "",
    status: "Active"
  })

  const fetchAgents = async () => {
    try {
      setLoading(true)
      const response = await fetch(API_ENDPOINTS.AGENTS)
      if (!response.ok) throw new Error('Failed to fetch agents')
      const agentsData = await response.json()
      setData(agentsData)
    } catch (error) {
      console.error('Error fetching agents:', error)
      toast.error('Failed to load agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAgents()
  }, [])

  const filteredData = useMemo(() => {
    return data.filter(agent => {
      const matchesSearch = !searchTerm || 
        agent.agentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        agent.agentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        agent.position.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesPosition = filters.position === "all" || agent.position === filters.position
      const matchesStatus = filters.status === "all" || agent.status === filters.status
      const matchesMinScore = !filters.minScore || agent.avgScore >= parseFloat(filters.minScore)
      const matchesMaxScore = !filters.maxScore || agent.avgScore <= parseFloat(filters.maxScore)
      const matchesMinCalls = !filters.minCalls || agent.callsHandled >= parseInt(filters.minCalls)
      const matchesMaxCalls = !filters.maxCalls || agent.callsHandled <= parseInt(filters.maxCalls)

      return matchesSearch && matchesPosition && matchesStatus && 
             matchesMinScore && matchesMaxScore && matchesMinCalls && matchesMaxCalls
    })
  }, [data, searchTerm, filters])

  const handleAddAgent = async () => {
    if (!newAgent.agentName || !newAgent.position) {
      toast.error("Please fill in all required fields")
      return
    }

    try {
      const response = await fetch(API_ENDPOINTS.AGENTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: newAgent.agentName,
          position: newAgent.position,
          status: newAgent.status
        })
      })

      if (!response.ok) throw new Error('Failed to create agent')

      await fetchAgents()
      setIsAddDialogOpen(false)
      
      toast.success(`${newAgent.agentName} has been added successfully`)

      setNewAgent({
        agentName: "",
        position: "",
        status: "Active"
      })
    } catch (error) {
      console.error('Error adding agent:', error)
      toast.error("Failed to add agent")
    }
  }

  const handleEditAgent = async () => {
    if (!editingAgent) return

    try {
      const response = await fetch(API_ENDPOINTS.AGENT_DETAIL(editingAgent.agentId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: editingAgent.agentName,
          position: editingAgent.position,
          status: editingAgent.status
        })
      })

      if (!response.ok) throw new Error('Failed to update agent')

      await fetchAgents()
      setIsEditDialogOpen(false)
      setEditingAgent(null)
      
      toast.success("Agent updated successfully")
    } catch (error) {
      console.error('Error updating agent:', error)
      toast.error("Failed to update agent")
    }
  }

  const handleDeleteAgent = async (agentId) => {
    if (!window.confirm("Are you sure you want to delete this agent?")) return

    try {
      const response = await fetch(API_ENDPOINTS.AGENT_DETAIL(agentId), {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Failed to delete agent')

      await fetchAgents()
      
      toast.success("Agent deleted successfully")
    } catch (error) {
      console.error('Error deleting agent:', error)
      toast.error("Failed to delete agent")
    }
  }

  const resetFilters = () => {
    setFilters({
      position: "all",
      status: "all",
      minScore: "",
      maxScore: "",
      minCalls: "",
      maxCalls: ""
    })
    setSearchTerm("")
  }

  const hasActiveFilters = useMemo(() => {
    return filters.position !== "all" || 
           filters.status !== "all" || 
           filters.minScore !== "" || 
           filters.maxScore !== "" || 
           filters.minCalls !== "" || 
           filters.maxCalls !== "" ||
           searchTerm !== ""
  }, [filters, searchTerm])

  const columnsWithHandlers = useMemo(() => {
    return columns.map(col => {
      if (col.id === "actions") {
        return {
          ...col,
          cell: ({ row }) => {
            const agent = row.original
            const [callsDialogOpen, setCallsDialogOpen] = React.useState(false)
            
            const handleViewProfile = async () => {
              onAgentSelect(agent);
              
              try {
                const response = await fetch(API_ENDPOINTS.AGENT_CALLS(agent.agentId));
                if (response.ok) {
                  const data = await response.json();
                  onCallsUpdate(data.calls || []);
                }
              } catch (error) {
                console.error('Error fetching agent calls:', error);
                onCallsUpdate([]);
              }
              
              document.getElementById('agent-card-section')?.scrollIntoView({ behavior: 'smooth' });
            };
            
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
                  <DropdownMenuItem onClick={() => navigator.clipboard.writeText(agent.agentId)}>
                    Copy Agent ID
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleViewProfile}>
                    View Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCallsDialogOpen(true)}>
                    View Calls
                  </DropdownMenuItem>
                  <AgentCallsDialog 
                    agentId={agent.agentId}
                    open={callsDialogOpen}
                    onOpenChange={setCallsDialogOpen}
                  />
                  <DropdownMenuItem onClick={() => {
                    setEditingAgent(agent)
                    setIsEditDialogOpen(true)
                  }}>
                    Edit Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="text-red-600"
                    onClick={() => handleDeleteAgent(agent.agentId)}
                  >
                    Delete Agent
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )
          }
        }
      }
      return col
    })
  }, [data, onAgentSelect, onCallsUpdate])

  return (
    <div>
      <Card className="@container/card">
        <CardHeader>
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <CardTitle className='@[250px]/card:text-3xl text-2xl font-semibold tabular-nums'>
                Agent Directory
              </CardTitle>
              <CardDescription>
                Manage and view agent profiles and performance records.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchAgents}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" size="sm">
                    <Plus className="h-4 w-4" />
                    Add Agent
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Add New Agent</DialogTitle>
                    <DialogDescription>
                      Enter the details of the new agent. Click save when you're done.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="agentName">Agent Name *</Label>
                      <Input
                        id="agentName"
                        value={newAgent.agentName}
                        onChange={(e) => setNewAgent({...newAgent, agentName: e.target.value})}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="position">Position *</Label>
                      <Select 
                        value={newAgent.position} 
                        onValueChange={(value) => setNewAgent({...newAgent, position: value})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select position" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Customer Support">Customer Support</SelectItem>
                          <SelectItem value="Technical Support">Technical Support</SelectItem>
                          <SelectItem value="Sales Representative">Sales Representative</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="status">Status</Label>
                      <Select 
                        value={newAgent.status} 
                        onValueChange={(value) => setNewAgent({...newAgent, status: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddAgent}>Add Agent</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap mt-4">
            <Input
              placeholder="Search agents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-1 rounded-sm px-1">
                      Active
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Position</Label>
                    <Select value={filters.position} onValueChange={(value) => setFilters({...filters, position: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Positions</SelectItem>
                        <SelectItem value="Customer Support">Customer Support</SelectItem>
                        <SelectItem value="Technical Support">Technical Support</SelectItem>
                        <SelectItem value="Sales Representative">Sales Representative</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={filters.status} onValueChange={(value) => setFilters({...filters, status: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {["Active", "Inactive"].map(status => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Score Range</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={filters.minScore}
                        onChange={(e) => setFilters({...filters, minScore: e.target.value})}
                        className="w-full"
                      />
                      <Input
                        type="number"
                        placeholder="Max"
                        value={filters.maxScore}
                        onChange={(e) => setFilters({...filters, maxScore: e.target.value})}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Calls Handled</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={filters.minCalls}
                        onChange={(e) => setFilters({...filters, minCalls: e.target.value})}
                        className="w-full"
                      />
                      <Input
                        type="number"
                        placeholder="Max"
                        value={filters.maxCalls}
                        onChange={(e) => setFilters({...filters, maxCalls: e.target.value})}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-2">
                <X className="h-4 w-4" />
                Reset
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading agents...</div>
          ) : (
            <DataTable columns={columnsWithHandlers} data={filteredData} />
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
            <DialogDescription>
              Update the agent details. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          {editingAgent && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="editAgentName">Agent Name *</Label>
                <Input
                  id="editAgentName"
                  value={editingAgent.agentName}
                  onChange={(e) => setEditingAgent({...editingAgent, agentName: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editPosition">Position *</Label>
                <Select 
                  value={editingAgent.position} 
                  onValueChange={(value) => setEditingAgent({...editingAgent, position: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Customer Support">Customer Support</SelectItem>
                    <SelectItem value="Technical Support">Technical Support</SelectItem>
                    <SelectItem value="Sales Representative">Sales Representative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editStatus">Status</Label>
                <Select 
                  value={editingAgent.status} 
                  onValueChange={(value) => setEditingAgent({...editingAgent, status: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditAgent}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}