import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button"
import { Funnel } from 'lucide-react';
import { API_ENDPOINTS } from '@/config/api';

export default function ReportFilteringCard({ onFilterChange }) {
  const [agents, setAgents] = React.useState([]);
  const [selectedAgent, setSelectedAgent] = React.useState("all");
  const [classification, setClassification] = React.useState("all");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.AGENTS);
      const data = await response.json();
      setAgents(data);
    } catch (error) {
      console.error('Error fetching agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    if (onFilterChange) {
      onFilterChange({
        agentId: selectedAgent,
        classification: classification
      });
    }
  };

  return (
    <Card>
        <CardHeader>
            <CardTitle className='text-2xl font-semibold'>Report Generation and Export</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-row justify-between gap-4'>
            <div className="flex flex-row items-center gap-2">
                <label className="text-sm font-medium">Agent</label>
                <Select value={selectedAgent} onValueChange={setSelectedAgent} disabled={loading}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select Agent" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Agents</SelectItem>
                        {agents.map((agent) => (
                            <SelectItem key={agent.agentId} value={agent.agentId}>
                                {agent.agentName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex flex-row items-center gap-2">
                <label className="text-sm font-medium">Classification</label>
                <Select value={classification} onValueChange={setClassification}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select Classification" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Classifications</SelectItem>
                        <SelectItem value="excellent">Excellent (90-100)</SelectItem>
                        <SelectItem value="good">Good (80-89)</SelectItem>
                        <SelectItem value="needs_improvement">Needs Improvement (&lt;80)</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <Button 
                className='bg-ring hover:bg-primary-foreground text-white'
                onClick={handleApplyFilters}
            >
                <Funnel className="mr-2 h-4 w-4" />
                Apply filters
            </Button>
        </CardContent>
    </Card>
  )
}