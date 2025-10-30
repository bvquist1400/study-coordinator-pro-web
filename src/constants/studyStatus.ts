export type StudyOperationalStatus = 'enrolling' | 'active' | 'closed_to_enrollment' | 'completed'
export type StudyRecruitmentStatus = 'enrolling' | 'paused' | 'closed_to_accrual' | 'on_hold'
export type StudyLifecycleStage = 'start_up' | 'active' | 'follow_up' | 'close_out'

export interface StatusOption<Value extends string> {
  value: Value
  label: string
  description?: string
}

export const STUDY_STATUS_OPTIONS: StatusOption<StudyOperationalStatus>[] = [
  { value: 'enrolling', label: 'Enrolling', description: 'Recruiting participants or preparing to enroll.' },
  { value: 'active', label: 'Active', description: 'Actively executing protocol activities.' },
  { value: 'closed_to_enrollment', label: 'Closed to Enrollment', description: 'Visits continue but new participants are not enrolled.' },
  { value: 'completed', label: 'Completed', description: 'All study activities are finished.' }
]

export const STUDY_RECRUITMENT_OPTIONS: StatusOption<StudyRecruitmentStatus>[] = [
  { value: 'enrolling', label: 'Enrolling (active accrual)' },
  { value: 'paused', label: 'Paused' },
  { value: 'closed_to_accrual', label: 'Closed to Accrual' },
  { value: 'on_hold', label: 'On Hold' }
]

export const STUDY_LIFECYCLE_OPTIONS: StatusOption<StudyLifecycleStage>[] = [
  { value: 'start_up', label: 'Start-up' },
  { value: 'active', label: 'Active' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'close_out', label: 'Close-out' }
]

const STATUS_LABEL_MAP: Record<StudyOperationalStatus, string> = STUDY_STATUS_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label
  return acc
}, {} as Record<StudyOperationalStatus, string>)

const STATUS_BADGE_CLASS_MAP: Record<StudyOperationalStatus, string> = {
  enrolling: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  active: 'text-green-400 bg-green-400/10 border-green-400/20',
  closed_to_enrollment: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  completed: 'text-gray-400 bg-gray-400/10 border-gray-400/20'
}

const RECRUITMENT_LABEL_MAP: Record<StudyRecruitmentStatus, string> = STUDY_RECRUITMENT_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label
  return acc
}, {} as Record<StudyRecruitmentStatus, string>)

const LIFECYCLE_LABEL_MAP: Record<StudyLifecycleStage, string> = STUDY_LIFECYCLE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label
  return acc
}, {} as Record<StudyLifecycleStage, string>)

export const formatStudyStatus = (status?: string | null) => {
  if (!status) return 'Unknown'
  return STATUS_LABEL_MAP[status as StudyOperationalStatus] ?? status
}

export const getStudyStatusBadgeClass = (status?: string | null) => {
  if (!status) return 'text-gray-400 bg-gray-400/10 border-gray-400/20'
  return STATUS_BADGE_CLASS_MAP[status as StudyOperationalStatus] ?? 'text-gray-400 bg-gray-400/10 border-gray-400/20'
}

export const formatRecruitmentStatus = (status?: string | null) => {
  if (!status) return 'Unknown'
  return RECRUITMENT_LABEL_MAP[status as StudyRecruitmentStatus] ?? status
}

export const formatLifecycleStage = (stage?: string | null) => {
  if (!stage) return 'Unknown'
  return LIFECYCLE_LABEL_MAP[stage as StudyLifecycleStage] ?? stage
}
