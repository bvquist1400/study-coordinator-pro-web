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
    render(<ScheduleOfEventsBuilder study={mockStudy} />)
    
    // Should show loading initially
    expect(screen.getByText('Loading visit schedules...')).toBeInTheDocument()
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    })
    
    // Should show study information
    expect(screen.getByText(`Define visit schedules for ${mockStudy.protocol_number}`)).toBeInTheDocument()
    
    // Should show default visit templates
    expect(screen.getByText('Screening')).toBeInTheDocument()
    expect(screen.getByText('Baseline')).toBeInTheDocument()
  })

  it('allows adding new visits', async () => {
    const user = userEvent.setup()
    render(<ScheduleOfEventsBuilder study={mockStudy} />)
    
    await waitFor(() => {
      expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    })
    
    // Click Add Visit button
    const addButton = screen.getByText('Add Visit')
    await user.click(addButton)
    
    // Should add a new visit row
    const visitRows = screen.getAllByText(/Visit \d+/)
    expect(visitRows.length).toBeGreaterThan(4) // Default has 4, should now have 5
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
    
    // Press Enter or blur to save
    await user.keyboard('{Enter}')
    
    // Should update the display
    expect(screen.getByText('Pre-Screening')).toBeInTheDocument()
  })

  it('allows editing visit days', async () => {
    const user = userEvent.setup()
    render(<ScheduleOfEventsBuilder study={mockStudy} />)
    
    await waitFor(() => {
      expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    })
    
    // Find a visit day cell and click it
    const dayCell = screen.getByText('-14')
    await user.click(dayCell)
    
    // Should show input field
    const input = screen.getByDisplayValue('-14')
    expect(input).toBeInTheDocument()
    
    // Change the day
    await user.clear(input)
    await user.type(input, '-7')
    await user.keyboard('{Enter}')
    
    // Should update the display
    expect(screen.getByText('-7')).toBeInTheDocument()
  })

  it('handles visit type selection', async () => {
    const user = userEvent.setup()
    render(<ScheduleOfEventsBuilder study={mockStudy} />)
    
    await waitFor(() => {
      expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    })
    
    // Find a visit type select
    const selectElements = screen.getAllByDisplayValue('screening')
    expect(selectElements.length).toBeGreaterThan(0)
    
    // Change the visit type
    await user.selectOptions(selectElements[0], 'baseline')
    
    // Should update the value
    expect(selectElements[0]).toHaveValue('baseline')
  })

  it('allows editing procedures', async () => {
    const user = userEvent.setup()
    render(<ScheduleOfEventsBuilder study={mockStudy} />)
    
    await waitFor(() => {
      expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    })
    
    // Find procedures cell and click it
    const proceduresText = screen.getByText(/Informed Consent/)
    await user.click(proceduresText)
    
    // Should show textarea
    const textarea = screen.getByDisplayValue(/Informed Consent/)
    expect(textarea).toBeInTheDocument()
    
    // Add more procedures
    await user.clear(textarea)
    await user.type(textarea, 'Informed Consent, Medical History, Physical Exam')
    await user.keyboard('{Enter}')
    
    // Should update the display
    expect(screen.getByText('Informed Consent, Medical History, Physical Exam')).toBeInTheDocument()
  })

  it('saves schedule to database', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn()
    
    render(<ScheduleOfEventsBuilder study={mockStudy} onSave={onSave} />)
    
    await waitFor(() => {
      expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    })
    
    // Click Save Schedule button
    const saveButton = screen.getByText('Save Schedule')
    await user.click(saveButton)
    
    // Should show saving state
    expect(screen.getByText('Saving...')).toBeInTheDocument()
    
    // Wait for save to complete
    await waitFor(() => {
      expect(screen.getByText('Save Schedule')).toBeInTheDocument()
    })
    
    // Should call Supabase methods
    expect(mockSupabaseDelete).toHaveBeenCalled()
    expect(mockSupabaseInsert).toHaveBeenCalled()
    expect(onSave).toHaveBeenCalled()
  })

  it('allows removing visits', async () => {
    const user = userEvent.setup()
    render(<ScheduleOfEventsBuilder study={mockStudy} />)
    
    await waitFor(() => {
      expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    })
    
    // Find a remove button (trash icon)
    const removeButtons = screen.getAllByTitle('Remove visit')
    const initialCount = removeButtons.length
    
    // Click remove button
    await user.click(removeButtons[0])
    
    // Should remove the visit row
    const updatedRemoveButtons = screen.getAllByTitle('Remove visit')
    expect(updatedRemoveButtons.length).toBe(initialCount - 1)
  })

  it('handles empty procedures gracefully', async () => {
    const user = userEvent.setup()
    render(<ScheduleOfEventsBuilder study={mockStudy} />)
    
    await waitFor(() => {
      expect(screen.getByText('Schedule of Events')).toBeInTheDocument()
    })
    
    // Find a procedures cell that might be empty and click it
    const emptyProceduresText = screen.getAllByText(/Click to add procedures/i)
    if (emptyProceduresText.length > 0) {
      await user.click(emptyProceduresText[0])
      
      // Should show placeholder text in textarea
      const textarea = screen.getByPlaceholderText('Enter procedures separated by commas')
      expect(textarea).toBeInTheDocument()
    }
  })
})