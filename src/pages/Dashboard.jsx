import React from 'react'
import { DateRangePicker, DateRangeProvider } from "@/components/dashboard/date-picker";
import { SectionCards } from "@/components/dashboard/section-cards";
import { SiteHeader } from '@/components/dashboard/site-header';
import { ChartAreaInteractive } from '@/components/dashboard/perfTrends-chart';
import { PerformanceLeaderboard } from '@/components/dashboard/agent-performance-leaderboard';
import { RecentHighImpactCalls } from '@/components/dashboard/recent-high-impact-call';

const Dashboard = () => {
  return (
    <DateRangeProvider>
      <SiteHeader />
      <div className="flex flex-row justify-between items-center p-4">
        <div className="flex flex-col">
          <h2 className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight">
            Dashboard Overview
          </h2>
        </div>
        <DateRangePicker />
      </div>

      <div className="@container/main flex flex-col gap-4">
        <div className="flex flex-col gap-4 md:gap-6">
          <SectionCards />
        </div>
        <div className="grid grid-cols-3 gap-4 px-4 items-stretch">
          <div className="col-span-2 w-full h-full">
            <ChartAreaInteractive className="h-full w-full" />
          </div>
          <div className="col-span-1 w-full h-full">
            <PerformanceLeaderboard className="h-full w-full" />
          </div>
        </div>
        <div className='gap-4 p-4 pt-0'>
          <RecentHighImpactCalls />
        </div>
      </div>
    </DateRangeProvider>
  )
}

export default Dashboard