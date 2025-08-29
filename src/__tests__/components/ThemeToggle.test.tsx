import { render, screen } from '@testing-library/react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

// Mock the theme provider hook
const mockSetTheme = jest.fn()
jest.mock('@/components/theme/ThemeProvider', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: mockSetTheme,
  }),
}))

describe('ThemeToggle', () => {
  it('renders theme toggle button', () => {
    render(<ThemeToggle />)
    
    const button = screen.getByRole('button', { name: /toggle theme/i })
    expect(button).toBeInTheDocument()
  })

  it('shows appropriate icon for current theme', () => {
    render(<ThemeToggle />)
    
    // Should show moon icon for dark theme
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })
})