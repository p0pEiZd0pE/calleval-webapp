import React from 'react'
import { columns } from '@/components/agent/columns';
import { DataTable } from '@/components/agent/data-table';
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import Agents from '@/components/agent/agents';
import { Input } from "@/components/ui/input"
import { Search } from 'lucide-react';

export default function AgentDirectory() {
    const [data, setData] = useState([]);
        
          useEffect(() => {
            async function getData() {
              Agents; setData(Agents);
            } getData();
          }, []);

  return (
    <div>
        <Card className="@container/card">
            <CardHeader>
                <CardTitle className='@[250px]/card:text-3xl text-2xl font-semibold tabular-nums'>Agent Directory</CardTitle>
                <CardDescription>
                Manage and view agent profiles and performance records.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className='flex justify-between items-center w-full'>
                    <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">Recent Call Evaluations</h4>
                    <Input 
                        placeholder="🔍 Search agents by name, email, or position..."
                        className='max-w-sm'
                    />
                </div>
            </CardContent>
            <CardContent>
                <DataTable columns={columns} data={data} />
            </CardContent>
        </Card>
    </div>
  )
}
