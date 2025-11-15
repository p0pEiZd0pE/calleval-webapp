import React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle } from "lucide-react"
import { API_ENDPOINTS } from '@/config/api'
import { authenticatedFetch } from '@/lib/api'

const SCORECARD_METRICS = {
  // All Phases - 10%
  "enthusiasm_markers": { name: "Enthusiasm Markers", weight: 10, phase: "All Phases" },
  
  // Opening Spiel - 10%
  "professional_greeting": { name: "Professional Greeting", weight: 5, phase: "Opening" },
  "verifies_patient_online": { name: "Verifies Patient Online", weight: 5, phase: "Opening" },
  
  // Middle/Climax - 70%
  "patient_verification": { name: "Patient Verification", weight: 25, phase: "Middle/Climax" },
  "active_listening": { name: "Active Listening / Handled with Care", weight: 10, phase: "Middle/Climax" },
  "asks_permission_hold": { name: "Asks Permission to Hold", weight: 10, phase: "Middle/Climax" },
  "has_fillers": { name: "No Fillers/Stammers", weight: 10, phase: "Middle/Climax" },
  "recaps_time_date": { name: "Recaps Time & Date", weight: 15, phase: "Middle/Climax" },
  
  // Closing - 10%
  "offers_further_assistance": { name: "Offers Further Assistance", weight: 5, phase: "Closing" },
  "ended_call_properly": { name: "Ended Call Properly", weight: 5, phase: "Closing" }
};

export default function CallEvalMetricsCard({ filters }) {
  const [metricsData, setMetricsData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [overallScore, setOverallScore] = React.useState(0);

  React.useEffect(() => {
    fetchMetricsData();
  }, [filters]);

  const fetchMetricsData = async () => {
    try {
      setLoading(true);
      
      const callsResponse = await authenticatedFetch(API_ENDPOINTS.CALLS);
      const callsData = await callsResponse.json();
      
      // Filter calls based on filters
      let filteredCalls = callsData.filter(c => c.status === 'completed' && c.binary_scores);
      
      if (filters?.agentId && filters.agentId !== 'all') {
        filteredCalls = filteredCalls.filter(call => call.agent_id === filters.agentId);
      }
      
      if (filters?.classification && filters.classification !== 'all') {
        filteredCalls = filteredCalls.filter(call => {
          const score = call.score || 0;
          switch(filters.classification) {
            case 'excellent':
              return score >= 90;
            case 'good':
              return score >= 80 && score < 90;
            case 'needs_improvement':
              return score < 80;
            default:
              return true;
          }
        });
      }
      
      if (filteredCalls.length === 0) {
        setMetricsData([]);
        setOverallScore(0);
        setLoading(false);
        return;
      }
      
      // Calculate metrics adherence
      const metricsCount = {};
      const metricsTotal = {};
      
      Object.keys(SCORECARD_METRICS).forEach(metric => {
        metricsCount[metric] = 0;
        metricsTotal[metric] = 0;
      });
      
      filteredCalls.forEach(call => {
        try {
          const binaryScores = typeof call.binary_scores === 'string' 
            ? JSON.parse(call.binary_scores) 
            : call.binary_scores;
          
          if (binaryScores && binaryScores.metrics) {
            Object.keys(binaryScores.metrics).forEach(metric => {
              if (metricsCount.hasOwnProperty(metric)) {
                metricsTotal[metric]++;
                if (binaryScores.metrics[metric].detected) {
                  metricsCount[metric]++;
                }
              }
            });
          }
        } catch (error) {
          console.error('Error parsing binary scores:', error);
        }
      });
      
      // Calculate percentages
      const metricsArray = Object.keys(SCORECARD_METRICS).map(key => {
        const percentage = metricsTotal[key] > 0 
          ? Math.round((metricsCount[key] / metricsTotal[key]) * 100)
          : 0;
        
        return {
          key,
          name: SCORECARD_METRICS[key].name,
          weight: SCORECARD_METRICS[key].weight,
          phase: SCORECARD_METRICS[key].phase,
          percentage,
          passed: metricsCount[key],
          total: metricsTotal[key]
        };
      });
      
      // Calculate overall score
      const totalScore = metricsArray.reduce((sum, m) => {
        return sum + (m.percentage / 100 * m.weight);
      }, 0);
      
      setMetricsData(metricsArray);
      setOverallScore(Math.round(totalScore));
      
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupedMetrics = {
    "All Phases": metricsData.filter(m => m.phase === "All Phases"),
    "Opening": metricsData.filter(m => m.phase === "Opening"),
    "Middle/Climax": metricsData.filter(m => m.phase === "Middle/Climax"),
    "Closing": metricsData.filter(m => m.phase === "Closing")
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>CallEval Scorecard Metrics</CardTitle>
            <CardDescription>
              Percentage of calls following each metric
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{loading ? "..." : `${overallScore}%`}</div>
            <p className="text-sm text-muted-foreground">Overall Score</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading metrics...
          </div>
        ) : metricsData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No evaluation data available for the selected filters
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedMetrics).map(([phase, metrics]) => (
              metrics.length > 0 && (
                <div key={phase} className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground">{phase}</h3>
                  {metrics.map((metric) => (
                    <div key={metric.key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {metric.percentage >= 70 ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className="text-sm font-medium">{metric.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {metric.weight}%
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {metric.passed}/{metric.total} calls
                          </span>
                          <span className={`text-sm font-bold ${
                            metric.percentage >= 70 ? "text-green-600" : "text-red-600"
                          }`}>
                            {metric.percentage}%
                          </span>
                        </div>
                      </div>
                      <Progress 
                        value={metric.percentage} 
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
              )
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}