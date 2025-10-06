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
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

const agentCall = [
  {
    callID: "CE-2023-0101",
    agent: "Alice Smith",
    issue: "Customer escalated",
    sentiment: "Negative",
    actions: "View Details",
  },
  {
    callID: "CE-2023-0102",
    agent: "Bob Johnson",
    issue: "Script deviation",
    sentiment: "Neutral",
    actions: "View Details",
  },
  {
    callID: "CE-2023-0103",
    agent: "Charlie Brown",
    issue: "Long hold time",
    sentiment: "Negative",
    actions: "View Details",
  },
  {
    callID: "CE-2023-0104",
    agent: "Diana Prince",
    issue: "Product query",
    sentiment: "Positive",
    actions: "View Details",
  },
  {
    callID: "CE-2023-0105",
    agent: "Eve Adams",
    issue: "Incorrect resolution",
    sentiment: "Negative",
    actions: "View Details",
  },
]

export function RecentHighImpactCalls() {
  return (
    <Card>
        <CardHeader>
            <CardTitle>Recent High-Impact Calls</CardTitle>
            <CardDescription>Calls flagged for specific issues requiring immediate attention.</CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Call ID</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead className="text-right px-10">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {agentCall.map((agentCall) => (
                    <TableRow key={agentCall.callID}>
                        <TableCell className="font-medium">{agentCall.callID}</TableCell>
                        <TableCell>{agentCall.agent}</TableCell>
                        <TableCell>{agentCall.issue}</TableCell>
                        <TableCell>
                            {agentCall.sentiment === "Positive" && (
                                <Badge className="bg-green-100 text-green-800 min-w-20" variant="outline">Positive</Badge>
                            )}
                            {agentCall.sentiment === "Neutral" && (
                                <Badge className="bg-yellow-100 text-yellow-800 min-w-20" variant="outline">Neutral</Badge>
                            )}
                            {agentCall.sentiment === "Negative" && (
                                <Badge className="bg-red-100 text-red-800 min-w-20" variant="outline">Negative</Badge>
                            )}
                        </TableCell>
                        <TableCell className="text-right"><Button variant="ghost">{agentCall.actions}</Button></TableCell>
                    </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
        <CardFooter className="justify-center">
            <Button variant="ghost">
                View All Evaluations
            </Button>
        </CardFooter>
    </Card>
  )
}
