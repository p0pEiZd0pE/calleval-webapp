"use client"

import React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function PerformanceLeaderboard({ className = "" }) {
  return (
    <Card className={`h-full flex flex-col ${className}`}> 
      <CardHeader>
        <CardTitle>Agent Performance Leaderboard</CardTitle>
        <CardDescription>Top and bottom performing agents based on recent evaluations.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='flex flex-row gap-2'>
          <Avatar className="h-8 w-8 rounded-full grayscale">
            <AvatarImage/>
            <AvatarFallback className="rounded-full">AS</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className='truncate font-semibold'>Alice Smith</span>
            <span className='truncate text-xs'>Score: 98%</span>
          </div>
          <Badge variant="secondary" className="bg-blue-500 text-white dark:bg-blue-600 min-w-30 rounded-full">Top Performer</Badge>
        </div>
      </CardContent>
      <CardContent>
        <div className='flex flex-row gap-2'>
          <Avatar className="h-8 w-8 rounded-full grayscale">
            <AvatarImage/>
            <AvatarFallback className="rounded-full">BJ</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className='truncate font-semibold'>Bob Johnson</span>
            <span className='truncate text-xs'>Score: 95%</span>
          </div>
          <Badge variant="secondary" className="bg-blue-500 text-white dark:bg-blue-600 min-w-30 rounded-full">Top Performer</Badge>
        </div>
      </CardContent>
      <CardContent>
        <div className='flex flex-row gap-2'>
          <Avatar className="h-8 w-8 rounded-full grayscale">
            <AvatarImage/>
            <AvatarFallback className="rounded-full">CB</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className='truncate font-semibold'>Charlie Brown</span>
            <span className='truncate text-xs'>Score: 88%</span>
          </div>
          <Badge variant="secondary" className="bg-blue-500 text-white dark:bg-blue-600 min-w-30 rounded-full">Top Performer</Badge>
        </div>
      </CardContent>
      <CardContent>
        <div className='flex flex-row gap-2'>
          <Avatar className="h-8 w-8 rounded-full grayscale">
            <AvatarImage/>
            <AvatarFallback className="rounded-full">DP</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className='truncate font-semibold'>Diana Prince</span>
            <span className='truncate text-xs'>Score: 72%</span>
          </div>
          <Badge variant="destructive" className="rounded-full min-w-30">Needs Coaching</Badge>
        </div>
      </CardContent>
      <CardContent>
        <div className='flex flex-row gap-2'>
          <Avatar className="h-8 w-8 rounded-full grayscale">
            <AvatarImage/>
            <AvatarFallback className="rounded-full">EA</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className='truncate font-semibold'>Eve Adams</span>
            <span className='truncate text-xs'>Score: 65%</span>
          </div>
          <Badge variant="destructive" className="rounded-full min-w-30">Needs Coaching</Badge>
        </div>
      </CardContent>
      <CardFooter className="justify-center">
        <Button variant="ghost">
          View All Agents
        </Button>
      </CardFooter>
    </Card>
  )
}
