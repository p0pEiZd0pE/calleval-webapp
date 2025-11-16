import { API_URL } from '@/config/api';
import { authenticatedFetch } from './api';

/**
 * Fetch user's theme settings from backend and apply immediately
 * This should be called after login to sync theme across devices
 */
export async function fetchAndApplyUserTheme() {
  try {
    console.log('Fetching user theme from backend...');
    
    const response = await authenticatedFetch(`${API_URL}/api/settings`);
    
    if (!response.ok) {
      console.error('Failed to fetch theme settings');
      return;
    }
    
    const data = await response.json();
    const theme = data.theme || 'light';
    
    console.log('User theme from backend:', theme);
    
    // Apply theme to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    
    console.log('Theme applied successfully:', theme);
    
    return theme;
  } catch (error) {
    console.error('Error fetching user theme:', error);
    
    // Fallback to localStorage or default
    const storedTheme = localStorage.getItem('theme') || 'light';
    if (storedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }
}

/**
 * Apply theme from localStorage (for initial page load before auth)
 */
export function applyStoredTheme() {
  const storedTheme = localStorage.getItem('theme');
  if (storedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}
