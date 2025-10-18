import React from 'react'
import { SiteHeader } from '../components/reports/site-header'
import ReportFilteringCard from '../components/reports/report-filtering-card';
import GenerateReportCard from '../components/reports/generate-report-card';
import StatsCards from '../components/reports/stats-card';
import CallEvalMetricsCard from '../components/reports/calleval-metrics-card';
import AgentPerformanceScores from '../components/reports/agent-performance-scores';
import CallClassificationBreakdown from '../components/reports/call-classification-breakdown';
import RecentReports from '../components/reports/recent-reports';

export default function Reports() {
  const [filters, setFilters] = React.useState({
    agentId: 'all',
    classification: 'all'
  });

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  return (
    <>
        <SiteHeader />
        <div className="flex flex-col p-4">
            <div>
              <h2 className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight">
                Reports Overview
              </h2>
            </div>
            
            <ReportFilteringCard onFilterChange={handleFilterChange} />
            
            <div className='grid grid-cols-1 md:grid-cols-2 auto-rows-fr py-4 gap-4'>
              <GenerateReportCard filters={filters} />
              <StatsCards filters={filters} />
              <CallEvalMetricsCard filters={filters} />
              <AgentPerformanceScores filters={filters} />
            </div>
            
            <div className='flex flex-col gap-4'>
              <CallClassificationBreakdown filters={filters} />
              <RecentReports />
            </div>
        </div>
    </>
  )
}