import React, { useEffect, useState, useMemo } from 'react'
import { columns } from '@/components/agent/columns'
import { DataTable } from '@/components/agent/data-table'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import Agents from '@/components/agent/agents'
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
import { Label } from "@/components/ui/label"
import { Plus, Filter, X } from 'lucide-react'
import { Badge } from "@/components/ui/badge"

export default function AgentDirectory() {
  const [data, setData] = useState([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [filters, setFilters] = useState({
    position: "all",
    status: "all",
    minScore: "",
    maxScore: "",
    minCalls: "",
    maxCalls: ""
  })
  
  // Form state for adding new agent
  const [newAgent, setNewAgent] = useState({
    agentName: "",
    position: "",
    status: "Active",
    avgScore: "",
    callsHandled: ""
  })

  useEffect(() => {
    setData(Agents)
  }, [])

  // Get unique positions and statuses for filters
  const uniquePositions = useMemo(() => {
    return [...new Set(data.map(agent => agent.position))]
  }, [data])

  const uniqueStatuses = useMemo(() => {
    return [...new Set(data.map(agent => agent.status))]
  }, [data])

  // Filter and search logic
  const filteredData = useMemo(() => {
    return data.filter(agent => {
      // Search filter
      const matchesSearch = searchTerm === "" || 
        agent.agentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        agent.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
        agent.agentId.toLowerCase().includes(searchTerm.toLowerCase())

      // Position filter
      const matchesPosition = filters.position === "all" || 
        agent.position === filters.position

      // Status filter
      const matchesStatus = filters.status === "all" || 
        agent.status === filters.status

      // Score range filter
      const matchesMinScore = filters.minScore === "" || 
        agent.avgScore >= parseFloat(filters.minScore)
      const matchesMaxScore = filters.maxScore === "" || 
        agent.avgScore <= parseFloat(filters.maxScore)

      // Calls handled range filter
      const matchesMinCalls = filters.minCalls === "" || 
        agent.callsHandled >= parseInt(filters.minCalls)
      const matchesMaxCalls = filters.maxCalls === "" || 
        agent.callsHandled <= parseInt(filters.maxCalls)

      return matchesSearch && matchesPosition && matchesStatus && 
             matchesMinScore && matchesMaxScore && 
             matchesMinCalls && matchesMaxCalls
    })
  }, [data, searchTerm, filters])

  // Add agent function
  const handleAddAgent = () => {
    if (!newAgent.agentName || !newAgent.position) {
      alert("Please fill in all required fields")
      return
    }

    const agentToAdd = {
      agentId: `C-${Math.floor(10000000 + Math.random() * 90000000)}`,
      agentName: newAgent.agentName,
      position: newAgent.position,
      status: newAgent.status,
      avgScore: parseFloat(newAgent.avgScore) || 0,
      callsHandled: parseInt(newAgent.callsHandled) || 0,
    }

    setData(prev => [...prev, agentToAdd])
    setIsAddDialogOpen(false)
    
    // Reset form
    setNewAgent({
      agentName: "",
      position: "",
      status: "Active",
      avgScore: "",
      callsHandled: ""
    })
  }

  // Delete agent function
  const handleDeleteAgent = (agentId) => {
    if (window.confirm("Are you sure you want to delete this agent?")) {
      setData(prev => prev.filter(agent => agent.agentId !== agentId))
    }
  }

  // Reset filters
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

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return filters.position !== "all" || 
           filters.status !== "all" || 
           filters.minScore !== "" || 
           filters.maxScore !== "" || 
           filters.minCalls !== "" || 
           filters.maxCalls !== "" ||
           searchTerm !== ""
  }, [filters, searchTerm])

  // Enhanced columns with delete functionality
  const enhancedColumns = useMemo(() => {
    return columns.map(col => {
      if (col.id === "actions") {
        return {
          ...col,
          cell: ({ row }) => {
            const agent = row.original
            return (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => handleDeleteAgent(agent.agentId)}
              >
                Delete
              </Button>
            )
          }
        }
      }
      return col
    })
  }, [data])

  return (
    <div>
      <Card className="@container/card">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className='@[250px]/card:text-3xl text-2xl font-semibold tabular-nums'>
                Agent Directory
              </CardTitle>
              <CardDescription>
                Manage and view agent profiles and performance records.
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
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
                      placeholder="Enter agent name"
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="avgScore">Avg. Score</Label>
                      <Input
                        id="avgScore"
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={newAgent.avgScore}
                        onChange={(e) => setNewAgent({...newAgent, avgScore: e.target.value})}
                        placeholder="0.0"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="callsHandled">Calls Handled</Label>
                      <Input
                        id="callsHandled"
                        type="number"
                        min="0"
                        value={newAgent.callsHandled}
                        onChange={(e) => setNewAgent({...newAgent, callsHandled: e.target.value})}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddAgent}>Save Agent</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          <div className='space-y-4'>
            {/* Search Bar */}
            <div className='flex justify-between items-center gap-4 flex-wrap'>
              <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">
                Recent Call Evaluations
              </h4>
              <div className="flex gap-2 items-center flex-1 max-w-sm">
                <Input 
                  placeholder="🔍 Search agents by name, ID, or position..."
                  className='flex-1'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSearchTerm("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Filters Section */}
            <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <h5 className="font-semibold">Filters</h5>
                  {hasActiveFilters && (
                    <Badge variant="secondary">{filteredData.length} results</Badge>
                  )}
                </div>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    Clear All
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Position Filter */}
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Select 
                    value={filters.position} 
                    onValueChange={(value) => setFilters({...filters, position: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Positions</SelectItem>
                      {uniquePositions.map(position => (
                        <SelectItem key={position} value={position}>
                          {position}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status Filter */}
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select 
                    value={filters.status} 
                    onValueChange={(value) => setFilters({...filters, status: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      {uniqueStatuses.map(status => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Score Range */}
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

                {/* Calls Handled Range */}
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
            </div>
          </div>
        </CardContent>

        <CardContent>
          <DataTable columns={enhancedColumns} data={filteredData} />
        </CardContent>
      </Card>
    </div>
  )
}