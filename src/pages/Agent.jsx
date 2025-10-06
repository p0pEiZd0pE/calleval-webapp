import React from 'react'
import { SiteHeader } from '@/components/agent/site-header';
import AgentDirectory from '../components/agent/agent-directory';
import AgentCardSection from '../components/agent/agent-card-section';


export default function Agent() {
  return (
    <>
        <SiteHeader />
        <div className='flex flex-col'>
            <h1 className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight p-4">Agent Directory</h1>
            <div className="p-4">
                <AgentDirectory />
            </div>
            <AgentCardSection />
        </div>
    </>
  )
}
