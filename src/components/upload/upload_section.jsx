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
import { UploadCloud } from "lucide-react";

export default function UploadSection() {
  return (
    <div>
        <Card className="items-stretch w-full mx-auto">
            <CardHeader>
                <CardTitle>New Call Upload</CardTitle>
                <CardDescription>
                    Drag and drop your audio files or browse to select for analysis.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="border-2 border-dashed rounded-md h-64 flex flex-col items-center justify-center text-center cursor-pointer">
                <p className="font-medium text-sm">Drop your WAV/MP3 files here or click to browse</p>
                <p className="text-xs text-muted-foreground">Supported formats: WAV, MP3</p>
                </div>
            </CardContent>
            <CardFooter className="flex justify-end space-x-2">
                <Button variant="outline">Clear All</Button>
                <Button className='bg-ring hover:bg-primary-foreground text-white'>
                    <UploadCloud className="w-4 h-4 mr-2" />
                    Upload All
                </Button>
            </CardFooter>
        </Card>
    </div>
  )
}
