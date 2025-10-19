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
import { toast } from 'sonner'
import { API_URL } from '@/config/api'

export default function GeneralApplicationSettings() {
  const [emailNotifications, setEmailNotifications] = React.useState(true)
  const [language, setLanguage] = React.useState('English')
  const [retentionPeriod, setRetentionPeriod] = React.useState('12')
  const [isDarkMode, setIsDarkMode] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)

  // Load settings from backend on mount
  React.useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setIsLoading(true)
    try {
      console.log('Fetching settings from:', `${API_URL}/api/settings`)
      const response = await fetch(`${API_URL}/api/settings`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('Settings fetched:', data)
      
      // Update all settings from backend
      setEmailNotifications(data.emailNotifications ?? true)
      setLanguage(data.language ?? 'English')
      setRetentionPeriod(data.retentionPeriod?.toString() ?? '12')
      
      // CRITICAL: Sync theme from backend to both state and localStorage
      const backendTheme = data.theme || 'light'
      const isDark = backendTheme === 'dark'
      
      setIsDarkMode(isDark)
      
      // Apply theme to document
      if (isDark) {
        document.documentElement.classList.add('dark')
        localStorage.setItem('theme', 'dark')
      } else {
        document.documentElement.classList.remove('dark')
        localStorage.setItem('theme', 'light')
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
      toast.error('Failed to load settings from server')
      
      // Fallback to localStorage if backend fails
      const storedTheme = localStorage.getItem('theme')
      const isDark = storedTheme === 'dark'
      setIsDarkMode(isDark)
      if (isDark) {
        document.documentElement.classList.add('dark')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Warn before leaving with unsaved changes
  React.useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  const handleThemeToggle = (checked) => {
    setIsDarkMode(checked)
    setHasUnsavedChanges(true)
    
    // Immediately apply theme to DOM and localStorage
    if (checked) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const settingsData = {
        emailNotifications,
        language,
        retentionPeriod: parseInt(retentionPeriod),
        theme: isDarkMode ? 'dark' : 'light',
      }

      console.log('Saving settings to:', `${API_URL}/api/settings`)
      console.log('Settings data:', settingsData)

      const response = await fetch(`${API_URL}/api/settings`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settingsData),
      })

      console.log('Response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error response:', errorText)
        throw new Error(`Failed to save settings: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      console.log('Save result:', result)

      toast.success('Settings saved successfully')
      setHasUnsavedChanges(false)
      
      // Ensure localStorage is synced after save
      localStorage.setItem('theme', settingsData.theme)
    } catch (error) {
      console.error('Save error:', error)
      toast.error(`Failed to save settings: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <Card className="flex flex-col justify-between w-full h-full">
        <CardContent className="flex items-center justify-center p-8">
          <p className="text-muted-foreground">Loading settings...</p>
        </CardContent>
      </Card>
    )
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
            onCheckedChange={(val) => {
              setEmailNotifications(val)
              setHasUnsavedChanges(true)
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="font-medium">Default Language</Label>
          <Select 
            value={language} 
            onValueChange={(val) => {
              setLanguage(val)
              setHasUnsavedChanges(true)
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="English">English</SelectItem>
              <SelectItem value="Spanish">Spanish</SelectItem>
              <SelectItem value="French">French</SelectItem>
              <SelectItem value="Tagalog">Tagalog</SelectItem>
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
          <Select 
            value={retentionPeriod} 
            onValueChange={(val) => {
              setRetentionPeriod(val)
              setHasUnsavedChanges(true)
            }}
          >
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

      <CardFooter className="justify-end gap-2">
        {hasUnsavedChanges && (
          <span className="text-sm text-amber-600 dark:text-amber-400 mr-auto">
            You have unsaved changes
          </span>
        )}
        <Button 
          onClick={handleSave} 
          disabled={isSaving || !hasUnsavedChanges}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </CardFooter>
    </Card>
  )
}