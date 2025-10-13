// src/utils/agentUtils.js
// Helper functions for agent management

/**
 * Generate a unique agent ID
 */
export const generateAgentId = () => {
  return `C-${Math.floor(10000000 + Math.random() * 90000000)}`
}

/**
 * Validate agent data before saving
 */
export const validateAgent = (agent) => {
  const errors = {}
  
  if (!agent.agentName || agent.agentName.trim() === '') {
    errors.agentName = 'Agent name is required'
  }
  
  if (!agent.position || agent.position === '') {
    errors.position = 'Position is required'
  }
  
  if (agent.avgScore && (agent.avgScore < 0 || agent.avgScore > 100)) {
    errors.avgScore = 'Score must be between 0 and 100'
  }
  
  if (agent.callsHandled && agent.callsHandled < 0) {
    errors.callsHandled = 'Calls handled cannot be negative'
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Calculate statistics for agents
 */
export const calculateAgentStats = (agents) => {
  if (!agents || agents.length === 0) {
    return {
      total: 0,
      active: 0,
      inactive: 0,
      avgScore: 0,
      totalCalls: 0,
      topPerformer: null
    }
  }
  
  const active = agents.filter(a => a.status === 'Active').length
  const avgScore = agents.reduce((sum, a) => sum + (a.avgScore || 0), 0) / agents.length
  const totalCalls = agents.reduce((sum, a) => sum + (a.callsHandled || 0), 0)
  const topPerformer = agents.reduce((top, agent) => 
    !top || agent.avgScore > top.avgScore ? agent : top
  , null)
  
  return {
    total: agents.length,
    active,
    inactive: agents.length - active,
    avgScore: avgScore.toFixed(1),
    totalCalls,
    topPerformer
  }
}

/**
 * Sort agents by different criteria
 */
export const sortAgents = (agents, sortBy, order = 'asc') => {
  const sorted = [...agents].sort((a, b) => {
    let aVal = a[sortBy]
    let bVal = b[sortBy]
    
    // Handle string comparison
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase()
      bVal = bVal.toLowerCase()
    }
    
    if (order === 'asc') {
      return aVal > bVal ? 1 : -1
    } else {
      return aVal < bVal ? 1 : -1
    }
  })
  
  return sorted
}

/**
 * Filter agents based on multiple criteria
 */
export const filterAgents = (agents, filters) => {
  return agents.filter(agent => {
    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase()
      const matchesSearch = 
        agent.agentName.toLowerCase().includes(search) ||
        agent.position.toLowerCase().includes(search) ||
        agent.agentId.toLowerCase().includes(search)
      if (!matchesSearch) return false
    }
    
    // Position filter
    if (filters.position && filters.position !== 'all') {
      if (agent.position !== filters.position) return false
    }
    
    // Status filter
    if (filters.status && filters.status !== 'all') {
      if (agent.status !== filters.status) return false
    }
    
    // Score range
    if (filters.minScore !== undefined && filters.minScore !== '') {
      if (agent.avgScore < parseFloat(filters.minScore)) return false
    }
    if (filters.maxScore !== undefined && filters.maxScore !== '') {
      if (agent.avgScore > parseFloat(filters.maxScore)) return false
    }
    
    // Calls range
    if (filters.minCalls !== undefined && filters.minCalls !== '') {
      if (agent.callsHandled < parseInt(filters.minCalls)) return false
    }
    if (filters.maxCalls !== undefined && filters.maxCalls !== '') {
      if (agent.callsHandled > parseInt(filters.maxCalls)) return false
    }
    
    return true
  })
}

/**
 * Export agents to CSV
 */
export const exportToCSV = (agents, filename = 'agents.csv') => {
  const headers = ['Agent ID', 'Agent Name', 'Position', 'Status', 'Avg Score', 'Calls Handled']
  const csvData = [
    headers.join(','),
    ...agents.map(agent => [
      agent.agentId,
      `"${agent.agentName}"`, // Wrap in quotes to handle commas in names
      `"${agent.position}"`,
      agent.status,
      agent.avgScore,
      agent.callsHandled
    ].join(','))
  ].join('\n')
  
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Get performance category based on score
 */
export const getPerformanceCategory = (score) => {
  if (score >= 90) return { category: 'Excellent', color: 'green' }
  if (score >= 80) return { category: 'Good', color: 'yellow' }
  if (score >= 70) return { category: 'Average', color: 'orange' }
  return { category: 'Needs Improvement', color: 'red' }
}

/**
 * Get agents by position
 */
export const getAgentsByPosition = (agents) => {
  return agents.reduce((acc, agent) => {
    if (!acc[agent.position]) {
      acc[agent.position] = []
    }
    acc[agent.position].push(agent)
    return acc
  }, {})
}

/**
 * Calculate performance trends
 */
export const calculateTrends = (agents) => {
  const positions = getAgentsByPosition(agents)
  
  return Object.entries(positions).map(([position, positionAgents]) => ({
    position,
    count: positionAgents.length,
    avgScore: (positionAgents.reduce((sum, a) => sum + a.avgScore, 0) / positionAgents.length).toFixed(1),
    totalCalls: positionAgents.reduce((sum, a) => sum + a.callsHandled, 0)
  }))
}

/**
 * Search agents with debouncing
 */
export const debounce = (func, wait) => {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * Format large numbers
 */
export const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

/**
 * Get unique values from array of objects
 */
export const getUniqueValues = (agents, key) => {
  return [...new Set(agents.map(agent => agent[key]))]
}

/**
 * Local storage helpers
 */
export const saveToLocalStorage = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data))
    return true
  } catch (error) {
    console.error('Error saving to localStorage:', error)
    return false
  }
}

export const loadFromLocalStorage = (key) => {
  try {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : null
  } catch (error) {
    console.error('Error loading from localStorage:', error)
    return null
  }
}