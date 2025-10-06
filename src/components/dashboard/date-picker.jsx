"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function DateRangePicker() {
  const [dateRange, setDateRange] = React.useState({
    from: new Date(2025, 7, 1), // August 1, 2025
    to: new Date(2025, 7, 10),
  })

  const formattedRange =
    dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, "PPP")} – ${format(dateRange.to, "PPP")}`
      : "Pick a date range"

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-[300px] justify-start text-left font-normal",
            !dateRange?.from && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formattedRange}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={dateRange}
          defaultMonth={dateRange?.from}
          onSelect={setDateRange}
          className="rounded-lg border shadow-sm"
        />
      </PopoverContent>
    </Popover>
  )
}
