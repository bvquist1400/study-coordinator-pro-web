export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: string
          organization: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: string
          organization?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: string
          organization?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      studies: {
        Row: {
          id: string
          user_id: string
          protocol_number: string
          study_title: string
          sponsor: string | null
          principal_investigator: string | null
          phase: string | null
          indication: string | null
          status: 'enrolling' | 'active' | 'closed_to_enrollment' | 'completed'
          start_date: string | null
          end_date: string | null
          target_enrollment: number | null
          visit_window_days: number
          dosing_frequency: 'QD' | 'BID' | 'TID' | 'QID' | 'weekly' | 'custom'
          compliance_threshold: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          protocol_number: string
          study_title: string
          sponsor?: string | null
          principal_investigator?: string | null
          phase?: string | null
          indication?: string | null
          status?: 'enrolling' | 'active' | 'closed_to_enrollment' | 'completed'
          start_date?: string | null
          end_date?: string | null
          target_enrollment?: number | null
          visit_window_days?: number
          dosing_frequency?: 'QD' | 'BID' | 'TID' | 'QID' | 'weekly' | 'custom'
          compliance_threshold?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          protocol_number?: string
          study_title?: string
          sponsor?: string | null
          principal_investigator?: string | null
          phase?: string | null
          indication?: string | null
          status?: 'enrolling' | 'active' | 'closed_to_enrollment' | 'completed'
          start_date?: string | null
          end_date?: string | null
          target_enrollment?: number | null
          visit_window_days?: number
          dosing_frequency?: 'QD' | 'BID' | 'TID' | 'QID' | 'weekly' | 'custom'
          compliance_threshold?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      subjects: {
        Row: {
          id: string
          study_id: string
          user_id: string
          subject_number: string
          initials: string | null
          date_of_birth: string | null
          gender: 'M' | 'F' | 'Other' | null
          enrollment_date: string
          randomization_date: string | null
          treatment_arm: string | null
          status: 'screening' | 'enrolled' | 'active' | 'completed' | 'discontinued' | 'withdrawn'
          discontinuation_reason: string | null
          discontinuation_date: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          study_id: string
          user_id: string
          subject_number: string
          initials?: string | null
          date_of_birth?: string | null
          gender?: 'M' | 'F' | 'Other' | null
          enrollment_date?: string
          randomization_date?: string | null
          treatment_arm?: string | null
          status?: 'screening' | 'enrolled' | 'active' | 'completed' | 'discontinued' | 'withdrawn'
          discontinuation_reason?: string | null
          discontinuation_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          study_id?: string
          user_id?: string
          subject_number?: string
          initials?: string | null
          date_of_birth?: string | null
          gender?: 'M' | 'F' | 'Other' | null
          enrollment_date?: string
          randomization_date?: string | null
          treatment_arm?: string | null
          status?: 'screening' | 'enrolled' | 'active' | 'completed' | 'discontinued' | 'withdrawn'
          discontinuation_reason?: string | null
          discontinuation_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      drug_compliance: {
        Row: {
          id: string
          subject_id: string
          user_id: string
          assessment_date: string
          dispensed_count: number
          returned_count: number
          expected_taken: number
          actual_taken: number
          compliance_percentage: number
          is_compliant: boolean
          visit_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          subject_id: string
          user_id: string
          assessment_date?: string
          dispensed_count: number
          returned_count?: number
          expected_taken: number
          visit_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          subject_id?: string
          user_id?: string
          assessment_date?: string
          dispensed_count?: number
          returned_count?: number
          expected_taken?: number
          visit_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      monitor_actions: {
        Row: {
          id: string
          study_id: string
          user_id: string
          cra_name: string
          visit_date: string
          action_item: string
          priority: 'low' | 'medium' | 'high' | 'critical'
          due_date: string | null
          status: 'open' | 'in_progress' | 'completed' | 'deferred'
          completion_date: string | null
          completion_notes: string | null
          follow_up_required: boolean
          subject_id: string | null
          category: 'general' | 'documentation' | 'safety' | 'compliance' | 'drug_accountability' | 'adverse_events' | 'protocol_deviation'
          attachments: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          study_id: string
          user_id: string
          cra_name: string
          visit_date?: string
          action_item: string
          priority?: 'low' | 'medium' | 'high' | 'critical'
          due_date?: string | null
          status?: 'open' | 'in_progress' | 'completed' | 'deferred'
          completion_date?: string | null
          completion_notes?: string | null
          follow_up_required?: boolean
          subject_id?: string | null
          category?: 'general' | 'documentation' | 'safety' | 'compliance' | 'drug_accountability' | 'adverse_events' | 'protocol_deviation'
          attachments?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          study_id?: string
          user_id?: string
          cra_name?: string
          visit_date?: string
          action_item?: string
          priority?: 'low' | 'medium' | 'high' | 'critical'
          due_date?: string | null
          status?: 'open' | 'in_progress' | 'completed' | 'deferred'
          completion_date?: string | null
          completion_notes?: string | null
          follow_up_required?: boolean
          subject_id?: string | null
          category?: 'general' | 'documentation' | 'safety' | 'compliance' | 'drug_accountability' | 'adverse_events' | 'protocol_deviation'
          attachments?: string[]
          created_at?: string
          updated_at?: string
        }
      }
      visit_schedules: {
        Row: {
          id: string
          study_id: string
          visit_name: string
          visit_number: number
          visit_day: number
          window_before_days: number
          window_after_days: number
          is_required: boolean
          visit_type: 'screening' | 'baseline' | 'regular' | 'unscheduled' | 'early_termination'
          procedures: string[]
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          study_id: string
          visit_name: string
          visit_number: number
          visit_day: number
          window_before_days?: number
          window_after_days?: number
          is_required?: boolean
          visit_type?: 'screening' | 'baseline' | 'regular' | 'unscheduled' | 'early_termination'
          procedures?: string[]
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          study_id?: string
          visit_name?: string
          visit_number?: number
          visit_day?: number
          window_before_days?: number
          window_after_days?: number
          is_required?: boolean
          visit_type?: 'screening' | 'baseline' | 'regular' | 'unscheduled' | 'early_termination'
          procedures?: string[]
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      subject_visits: {
        Row: {
          id: string
          study_id: string
          subject_id: string
          visit_schedule_id: string | null
          user_id: string
          visit_name: string
          scheduled_date: string
          actual_date: string | null
          status: 'scheduled' | 'completed' | 'missed' | 'cancelled'
          is_within_window: boolean | null
          days_from_scheduled: number | null
          procedures_completed: string[]
          
          // Lab Kit Accountability
          lab_kit_required: boolean | null
          accession_number: string | null
          airway_bill_number: string | null
          lab_kit_shipped_date: string | null
          
          // Drug Accountability
          drug_dispensing_required: boolean | null
          previous_dispense_date: string | null
          tablets_dispensed: number | null
          tablets_returned: number | null
          actual_start_date: string | null
          
          // Local Labs
          local_labs_required: boolean | null
          local_labs_completed: boolean | null
          
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          study_id: string
          subject_id: string
          visit_schedule_id?: string | null
          user_id: string
          visit_name: string
          scheduled_date: string
          actual_date?: string | null
          status?: 'scheduled' | 'completed' | 'missed' | 'cancelled'
          is_within_window?: boolean | null
          days_from_scheduled?: number | null
          procedures_completed?: string[]
          
          // Lab Kit Accountability
          lab_kit_required?: boolean | null
          accession_number?: string | null
          airway_bill_number?: string | null
          lab_kit_shipped_date?: string | null
          
          // Drug Accountability
          drug_dispensing_required?: boolean | null
          previous_dispense_date?: string | null
          tablets_dispensed?: number | null
          tablets_returned?: number | null
          actual_start_date?: string | null
          
          // Local Labs
          local_labs_required?: boolean | null
          local_labs_completed?: boolean | null
          
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          study_id?: string
          subject_id?: string
          visit_schedule_id?: string | null
          user_id?: string
          visit_name?: string
          scheduled_date?: string
          actual_date?: string | null
          status?: 'scheduled' | 'completed' | 'missed' | 'cancelled'
          is_within_window?: boolean | null
          days_from_scheduled?: number | null
          procedures_completed?: string[]
          
          // Lab Kit Accountability
          lab_kit_required?: boolean | null
          accession_number?: string | null
          airway_bill_number?: string | null
          lab_kit_shipped_date?: string | null
          
          // Drug Accountability
          drug_dispensing_required?: boolean | null
          previous_dispense_date?: string | null
          tablets_dispensed?: number | null
          tablets_returned?: number | null
          actual_start_date?: string | null
          
          // Local Labs
          local_labs_required?: boolean | null
          local_labs_completed?: boolean | null
          
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      protocol_deviations: {
        Row: {
          id: string
          study_id: string
          subject_id: string | null
          user_id: string
          deviation_date: string
          deviation_type: string
          description: string
          severity: 'minor' | 'major' | 'critical'
          is_reportable: boolean
          root_cause: string | null
          corrective_action: string | null
          preventive_action: string | null
          status: 'identified' | 'investigating' | 'resolved' | 'closed'
          resolution_date: string | null
          reported_to_sponsor: boolean
          reported_to_irb: boolean
          visit_id: string | null
          category: 'inclusion_exclusion' | 'consent' | 'visit_window' | 'dosing' | 'laboratory' | 'adverse_event' | 'drug_accountability' | 'other'
          impact_assessment: string | null
          attachments: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          study_id: string
          subject_id?: string | null
          user_id: string
          deviation_date?: string
          deviation_type: string
          description: string
          severity?: 'minor' | 'major' | 'critical'
          is_reportable?: boolean
          root_cause?: string | null
          corrective_action?: string | null
          preventive_action?: string | null
          status?: 'identified' | 'investigating' | 'resolved' | 'closed'
          resolution_date?: string | null
          reported_to_sponsor?: boolean
          reported_to_irb?: boolean
          visit_id?: string | null
          category?: 'inclusion_exclusion' | 'consent' | 'visit_window' | 'dosing' | 'laboratory' | 'adverse_event' | 'drug_accountability' | 'other'
          impact_assessment?: string | null
          attachments?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          study_id?: string
          subject_id?: string | null
          user_id?: string
          deviation_date?: string
          deviation_type?: string
          description?: string
          severity?: 'minor' | 'major' | 'critical'
          is_reportable?: boolean
          root_cause?: string | null
          corrective_action?: string | null
          preventive_action?: string | null
          status?: 'identified' | 'investigating' | 'resolved' | 'closed'
          resolution_date?: string | null
          reported_to_sponsor?: boolean
          reported_to_irb?: boolean
          visit_id?: string | null
          category?: 'inclusion_exclusion' | 'consent' | 'visit_window' | 'dosing' | 'laboratory' | 'adverse_event' | 'drug_accountability' | 'other'
          impact_assessment?: string | null
          attachments?: string[]
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types for commonly used database operations
export type Study = Database['public']['Tables']['studies']['Row']
export type StudyInsert = Database['public']['Tables']['studies']['Insert']
export type StudyUpdate = Database['public']['Tables']['studies']['Update']

export type Subject = Database['public']['Tables']['subjects']['Row']
export type SubjectInsert = Database['public']['Tables']['subjects']['Insert']
export type SubjectUpdate = Database['public']['Tables']['subjects']['Update']

export type DrugCompliance = Database['public']['Tables']['drug_compliance']['Row']
export type DrugComplianceInsert = Database['public']['Tables']['drug_compliance']['Insert']
export type DrugComplianceUpdate = Database['public']['Tables']['drug_compliance']['Update']

export type MonitorAction = Database['public']['Tables']['monitor_actions']['Row']
export type MonitorActionInsert = Database['public']['Tables']['monitor_actions']['Insert']
export type MonitorActionUpdate = Database['public']['Tables']['monitor_actions']['Update']

export type ProtocolDeviation = Database['public']['Tables']['protocol_deviations']['Row']
export type ProtocolDeviationInsert = Database['public']['Tables']['protocol_deviations']['Insert']
export type ProtocolDeviationUpdate = Database['public']['Tables']['protocol_deviations']['Update']

export type VisitSchedule = Database['public']['Tables']['visit_schedules']['Row']
export type VisitScheduleInsert = Database['public']['Tables']['visit_schedules']['Insert']
export type VisitScheduleUpdate = Database['public']['Tables']['visit_schedules']['Update']

export type SubjectVisit = Database['public']['Tables']['subject_visits']['Row']
export type SubjectVisitInsert = Database['public']['Tables']['subject_visits']['Insert']
export type SubjectVisitUpdate = Database['public']['Tables']['subject_visits']['Update']