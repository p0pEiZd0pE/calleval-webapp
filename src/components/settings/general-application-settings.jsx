import React from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'


export default function GeneralApplicationSettings() {
  const [emailNotifications, setEmailNotifications] = React.useState(true)
  const [language, setLanguage] = React.useState('English')
  const [retentionPeriod, setRetentionPeriod] = React.useState('12')
  const [isDarkMode, setIsDarkMode] = React.useState(false)

  React.useEffect(() => {
    const storedTheme = localStorage.getItem('theme')
    if (storedTheme === 'dark') {
      document.documentElement.classList.add('dark')
      setIsDarkMode(true)
    }
  }, [])

  const handleThemeToggle = (checked) => {
    setIsDarkMode(checked)
    if (checked) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  const handleSave = () => {
    console.log('Saved settings:', {
      emailNotifications,
      language,
      retentionPeriod,
      theme: isDarkMode ? 'dark' : 'light',
    })


  }
  return (
    <Card className="flex flex-col justify-between w-full h-full">
      <CardHeader>
        <CardTitle>General Application Settings</CardTitle>
        <CardDescription>
          Configure global application preferences.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-10">
        <div className="flex items-center justify-between">
          <Label className="font-medium">Enable Email Notifications</Label>
          <Switch
            checked={emailNotifications}
            onCheckedChange={setEmailNotifications}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="font-medium">Default Language</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="English">English</SelectItem>
              <SelectItem value="Spanish">Spanish</SelectItem>
              <SelectItem value="French">French</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-row justify-between space-y-2">
            <div className='flex flex-col gap-2'>
                <Label className="font-medium">Data Retention Period</Label>
                <p className="text-sm text-muted-foreground">
                    Automatically delete call data older than the specified period.
                </p>
            </div>
            <Select value={retentionPeriod} onValueChange={setRetentionPeriod}>
                <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Select months" />
                </SelectTrigger>
                <SelectContent>
                {[...Array(12)].map((_, i) => {
                    const month = (i + 1).toString()
                    return (
                    <SelectItem key={month} value={month}>
                        {month} {i === 0 ? 'month' : 'months'}
                    </SelectItem>
                    )
                })}
                </SelectContent>
            </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label className="font-medium">Dark Mode</Label>
          <Switch checked={isDarkMode} onCheckedChange={handleThemeToggle} />
        </div>
      </CardContent>

      <CardFooter className="justify-end">
        <Button onClick={handleSave}>Save General Settings</Button>
      </CardFooter>
    </Card>
  )
}
