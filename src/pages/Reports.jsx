import React from 'react'
import { SiteHeader } from '../components/reports/site-header'
import ReportFilteringCard from '../components/reports/report-filtering-card';
import GenerateReportCard from '../components/reports/generate-report-card';
import StatsCards from '../components/reports/stats-card';
import CallVolumenAndSatifactionTrend from '../components/reports/call-volume-and-satisfaction-trend';
import AgentPerformanceScores from '../components/reports/agent-performance-scores';
import CallClassificationBreakdown from '../components/reports/call-classification-breakdown';
import RecentReports from '../components/reports/recent-reports';



export default function Reports() {
  return (
    <>
        <SiteHeader />
        <div className="flex flex-col p-4">
            <div>
              <h2 className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight">
                Reports Overview
              </h2>
            </div>
            <ReportFilteringCard />
            <div className='grid grid-cols-2 grid-rows-2 py-4 gap-4'>
              <div className='col-span-1 w-full h-full'>
                <GenerateReportCard className="h-full w-full" />
              </div>
              <div className='col-span-1 w-full h-full'>
                <StatsCards className="h-full w-full" />
              </div>
              <div className='col-span-1 w-full h-full'>
                <CallVolumenAndSatifactionTrend />
              </div>
              <div className='col-span-1 w-full h-full'>
                <AgentPerformanceScores />
              </div>
            </div>
            <div className='flex flex-col gap-4'>
              <CallClassificationBreakdown />
              <RecentReports />
            </div>
        </div>
    </>
  )
}
