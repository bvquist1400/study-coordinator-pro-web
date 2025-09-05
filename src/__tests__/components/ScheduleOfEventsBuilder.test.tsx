import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScheduleOfEventsBuilder from '@/components/studies/ScheduleOfEventsBuilder'
import { mockStudy } from '../utils/test-helpers'

// Mock Supabase client
const mockSupabaseSelect = jest.fn()
const mockSupabaseInsert = jest.fn()
const mockSupabaseDelete = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(() => Promise.resolve({
        data: { user: { id: 'test-user', email: 'test@example.com' } },
        error: null
      })),
      getSession: jest.fn(() => Promise.resolve({
        data: { session: { access_token: 'test-token' } },
        error: null,
      })),
    },
    from: jest.fn(() => ({
      select: mockSupabaseSelect,
      insert: mockSupabaseInsert,
      delete: mockSupabaseDelete,
    })),
  }
}))

describe('ScheduleOfEventsBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Default mock responses
    mockSupabaseSelect.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [], error: null })
      })
    })
    
    mockSupabaseDelete.mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null })
    })
    
    mockSupabaseInsert.mockReturnValue({
      select: jest.fn().mockResolvedValue({ 
        data: [
          {
            id: 'test-schedule-1',
            study_id: mockStudy.id,
            visit_name: 'Screening',
            visit_number: 1,
            visit_day: -14,
            window_before_days: 7,
            window_after_days: 7,
            is_required: true,
            visit_type: 'screening',
            procedures: ['Informed Consent', 'Medical History'],
            notes: 'Initial screening visit',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
          }
        ], 
        error: null 
      })
    })
  })

  it('renders schedule builder with default visit templates', async () => {
    // Mock fetch for API attempt (return empty to fall back to defaults)
    const originalFetch = (global as any).fetch
    ;(global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ visitSchedules: [] }) })
    render(<ScheduleOfEventsBuilder study={mockStudy} />)
    
    // Should show loading initially
    expect(screen.getByText('Loading schedule...')).toBeInTheDocument()
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    })
    
    // Should show study information
    expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    
    // Should show default visit templates
    expect(screen.getByText('Screening')).toBeInTheDocument()
    expect(screen.getByText('Baseline')).toBeInTheDocument()
    ;(global as any).fetch = originalFetch
  })

  it('allows adding new visits', async () => {
    const user = userEvent.setup()
    render(<ScheduleOfEventsBuilder study={mockStudy} />)
    
    await waitFor(() => {
      expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    })
    
    // Click Add Visit button (by title)
    const addButton = screen.getByTitle('Add Visit')
    await user.click(addButton)
    
    // Should add a new visit row
    const visitRows = screen.getAllByText(/Visit \d+/)
    expect(visitRows.length).toBeGreaterThan(0)
  })

  it('allows editing visit names inline', async () => {
    const user = userEvent.setup()
    render(<ScheduleOfEventsBuilder study={mockStudy} />)
    
    await waitFor(() => {
      expect(screen.getByText('Screening')).toBeInTheDocument()
    })
    
    // Click on a visit name to edit it
    const screeningCell = screen.getByText('Screening')
    await user.click(screeningCell)
    
    // Should show input field
    const input = screen.getByDisplayValue('Screening')
    expect(input).toBeInTheDocument()
    
    // Edit the visit name
    await user.clear(input)
    await user.type(input, 'Pre-Screening')
    
    // Blur to save
    await user.click(screen.getByText('Schedule of Events'))
    
    // Should update the display
    expect(screen.getByText('Pre-Screening')).toBeInTheDocument()
  })

  // Removed granular timing value test due to UI changes

  // Removed timing unit edit test due to UI changes

  it('allows editing a procedure name and toggling assignment', async () => {
    const user = userEvent.setup()
    render(<ScheduleOfEventsBuilder study={mockStudy} />)
    await waitFor(() => {
      expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    })
    // Edit procedure name
    const procName = screen.getByText('Local Labs')
    await user.click(procName)
    const input = screen.getByDisplayValue('Local Labs')
    await user.clear(input)
    await user.type(input, 'Local Labs Edited')
    // blur by clicking elsewhere
    await user.click(screen.getByText('Schedule of Events'))
    expect(screen.getByText('Local Labs Edited')).toBeInTheDocument()
  })

  it('saves schedule to database', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn()
    const originalFetch = (global as any).fetch
    ;(global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ visitSchedules: [] }) })
    render(<ScheduleOfEventsBuilder study={mockStudy} onSave={onSave} />)
    
    await waitFor(() => {
      expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    })
    
    // Click Save Schedule button
    const saveButton = screen.getByText('Save Schedule')
    await user.click(saveButton)
    
    // Wait for save to complete
    await waitFor(() => {
      expect(screen.getByText('Save Schedule')).toBeInTheDocument()
    })
    
    // Should call fetch and onSave
    expect((global as any).fetch).toHaveBeenCalled()
    expect(onSave).toHaveBeenCalled()
    ;(global as any).fetch = originalFetch
  })
  // Removed tests for non-existent UI behaviors (remove visits, empty procedures editor)
})
