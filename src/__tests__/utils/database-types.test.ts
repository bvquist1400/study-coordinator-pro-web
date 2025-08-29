import type { Study, StudyInsert, StudyUpdate } from '@/types/database'

describe('Database Types', () => {
  it('should have correct Study type structure', () => {
    const mockStudy: Study = {
      id: 'test-id',
      user_id: 'user-id',
      protocol_number: 'ABC-123',
      study_title: 'Test Study',
      sponsor: 'Test Sponsor',
      principal_investigator: 'Dr. Test',
      phase: 'Phase I',
      indication: 'Test Indication',
      status: 'enrolling',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      target_enrollment: 100,
      visit_window_days: 7,
      dosing_frequency: 'QD',
      compliance_threshold: 80,
      notes: 'Test notes',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    expect(mockStudy.id).toBe('test-id')
    expect(mockStudy.status).toBe('enrolling')
    expect(mockStudy.dosing_frequency).toBe('QD')
    expect(mockStudy.compliance_threshold).toBe(80)
  })

  it('should have correct StudyInsert type structure', () => {
    const mockStudyInsert: StudyInsert = {
      user_id: 'user-id',
      protocol_number: 'ABC-123',
      study_title: 'Test Study',
      sponsor: 'Test Sponsor',
      principal_investigator: 'Dr. Test',
    }

    expect(mockStudyInsert.user_id).toBe('user-id')
    expect(mockStudyInsert.protocol_number).toBe('ABC-123')
  })

  it('should allow partial updates in StudyUpdate type', () => {
    const mockStudyUpdate: StudyUpdate = {
      status: 'active',
      notes: 'Updated notes',
    }

    expect(mockStudyUpdate.status).toBe('active')
    expect(mockStudyUpdate.notes).toBe('Updated notes')
  })

  it('should enforce status enum values', () => {
    const validStatuses: Study['status'][] = [
      'enrolling',
      'active', 
      'closed_to_enrollment',
      'completed'
    ]

    validStatuses.forEach(status => {
      const study: Partial<Study> = { status }
      expect(study.status).toBe(status)
    })
  })

  it('should enforce dosing frequency enum values', () => {
    const validFrequencies: Study['dosing_frequency'][] = [
      'QD',
      'BID',
      'TID', 
      'QID',
      'weekly',
      'custom'
    ]

    validFrequencies.forEach(frequency => {
      const study: Partial<Study> = { dosing_frequency: frequency }
      expect(study.dosing_frequency).toBe(frequency)
    })
  })
})