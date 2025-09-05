// Test utility functions and helpers

// Mock user data for tests
export const mockUser = {
  id: 'test-user-id',
  email: 'coordinator@test.com',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

// Mock study data for tests
export const mockStudy = {
  id: 'test-study-id',
  user_id: 'test-user-id',
  protocol_number: 'TEST-001',
  study_title: 'Test Clinical Study',
  sponsor: 'Test Pharma Inc',
  principal_investigator: 'Dr. Test User',
  phase: 'Phase II',
  indication: 'Test Indication',
  status: 'enrolling' as const,
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  target_enrollment: 100,
  visit_window_days: 7,
  dosing_frequency: 'QD' as const,
  compliance_threshold: 80,
  notes: 'Test study notes',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

// Mock visit schedule data
export const mockVisitSchedule = {
  id: 'test-visit-schedule-id',
  study_id: 'test-study-id',
  visit_name: 'Screening',
  visit_number: 1,
  visit_day: -14,
  window_before_days: 7,
  window_after_days: 7,
  is_required: true,
  visit_type: 'screening' as const,
  procedures: ['Informed Consent', 'Medical History', 'Physical Exam'],
  notes: 'Initial screening visit',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

// Mock Supabase responses
export const mockSupabaseResponse = {
  success: { data: [mockStudy], error: null },
  error: { data: null, error: { message: 'Test error', code: 'TEST_ERROR' } },
  empty: { data: [], error: null },
}

// Placeholder test to satisfy Jest's requirement for files under __tests__ to contain at least one test
describe('utils/test-helpers placeholder', () => {
  it('noop', () => {
    expect(true).toBe(true)
  })
})
