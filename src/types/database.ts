// Generic JSON type for Supabase JSON/JSONB columns
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[]

export interface Database {
  public: {
    Tables: {
      sites: {
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
      },
      site_members: {
        Row: {
          site_id: string
          user_id: string
          role: 'owner' | 'coordinator' | 'pi' | 'monitor'
          created_at: string
        }
        Insert: {
          site_id: string
          user_id: string
          role?: 'owner' | 'coordinator' | 'pi' | 'monitor'
          created_at?: string
        }
        Update: {
          site_id?: string
          user_id?: string
          role?: 'owner' | 'coordinator' | 'pi' | 'monitor'
          created_at?: string
        }
      },
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
          protocol_version: string | null
          sponsor: string | null
          principal_investigator: string | null
          phase: string | null
          indication: string | null
          status: 'enrolling' | 'active' | 'closed_to_enrollment' | 'completed'
          start_date: string | null
          end_date: string | null
          target_enrollment: number | null
          visit_window_days: number
          inventory_buffer_days: number
          visit_window_buffer_days: number
          anchor_day: number
          dosing_frequency: 'QD' | 'BID' | 'TID' | 'QID' | 'weekly' | 'custom'
          compliance_threshold: number
          notes: string | null
          site_id?: string | null
          created_by?: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          protocol_number: string
          study_title: string
          protocol_version?: string | null
          sponsor?: string | null
          principal_investigator?: string | null
          phase?: string | null
          indication?: string | null
          status?: 'enrolling' | 'active' | 'closed_to_enrollment' | 'completed'
          start_date?: string | null
          end_date?: string | null
          target_enrollment?: number | null
          visit_window_days?: number
          inventory_buffer_days?: number
          visit_window_buffer_days?: number
          anchor_day?: number
          dosing_frequency?: 'QD' | 'BID' | 'TID' | 'QID' | 'weekly' | 'custom'
          compliance_threshold?: number
          notes?: string | null
          site_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          protocol_number?: string
          study_title?: string
          protocol_version?: string | null
          sponsor?: string | null
          principal_investigator?: string | null
          phase?: string | null
          indication?: string | null
          status?: 'enrolling' | 'active' | 'closed_to_enrollment' | 'completed'
          start_date?: string | null
          end_date?: string | null
          target_enrollment?: number | null
          visit_window_days?: number
          inventory_buffer_days?: number
          visit_window_buffer_days?: number
          anchor_day?: number
          dosing_frequency?: 'QD' | 'BID' | 'TID' | 'QID' | 'weekly' | 'custom'
          compliance_threshold?: number
          notes?: string | null
          site_id?: string | null
          created_by?: string | null
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
          gender: 'M' | 'F' | 'Other' | null
          enrollment_date: string
          randomization_date: string | null
          treatment_arm: string | null
          status: 'screening' | 'active' | 'completed' | 'discontinued' | 'withdrawn'
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
          gender?: 'M' | 'F' | 'Other' | null
          enrollment_date?: string
          randomization_date?: string | null
          treatment_arm?: string | null
          status?: 'screening' | 'active' | 'completed' | 'discontinued' | 'withdrawn'
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
          gender?: 'M' | 'F' | 'Other' | null
          enrollment_date?: string
          randomization_date?: string | null
          treatment_arm?: string | null
          status?: 'screening' | 'active' | 'completed' | 'discontinued' | 'withdrawn'
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
          ip_id: string | null
          dispensing_date: string | null
          ip_last_dose_date: string | null
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
          ip_id?: string | null
          dispensing_date?: string | null
          ip_last_dose_date?: string | null
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
          ip_id?: string | null
          dispensing_date?: string | null
          ip_last_dose_date?: string | null
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
          section_id: string | null
          visit_name: string
          visit_number: string
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
          section_id?: string | null
          visit_name: string
          visit_number: string
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
          section_id?: string | null
          visit_name?: string
          visit_number?: string
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
          visit_date: string
          status: 'scheduled' | 'completed' | 'missed' | 'cancelled'
          is_within_window: boolean | null
          days_from_scheduled: number | null
          procedures_completed: string[]
          subject_section_id: string | null
          cycle_index: number | null
          is_unscheduled: boolean | null
          unscheduled_reason: string | null
          
          // Lab Kit Accountability
          lab_kit_required: boolean | null
          lab_kit_id: string | null
          accession_number: string | null
          airway_bill_number: string | null
          lab_kit_shipped_date: string | null
          
          // Drug Accountability  
          drug_dispensing_required: boolean | null
          previous_dispense_date: string | null
          tablets_dispensed: number | null
          tablets_returned: number | null
          ip_start_date: string | null
          ip_last_dose_date: string | null
          ip_dispensed: number | null
          ip_returned: number | null
          ip_id: string | null
          
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
          visit_date: string
          status?: 'scheduled' | 'completed' | 'missed' | 'cancelled'
          is_within_window?: boolean | null
          days_from_scheduled?: number | null
          procedures_completed?: string[]
          subject_section_id?: string | null
          cycle_index?: number | null
          is_unscheduled?: boolean | null
          unscheduled_reason?: string | null
          
          // Lab Kit Accountability
          lab_kit_required?: boolean | null
          lab_kit_id?: string | null
          accession_number?: string | null
          airway_bill_number?: string | null
          lab_kit_shipped_date?: string | null
          
          // Drug Accountability
          drug_dispensing_required?: boolean | null
          previous_dispense_date?: string | null
          tablets_dispensed?: number | null
          tablets_returned?: number | null
          ip_start_date?: string | null
          ip_last_dose_date?: string | null
          ip_dispensed?: number | null
          ip_returned?: number | null
          ip_id?: string | null
          
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
          visit_date?: string
          status?: 'scheduled' | 'completed' | 'missed' | 'cancelled'
          is_within_window?: boolean | null
          days_from_scheduled?: number | null
          procedures_completed?: string[]
          subject_section_id?: string | null
          cycle_index?: number | null
          is_unscheduled?: boolean | null
          unscheduled_reason?: string | null
          
          // Lab Kit Accountability
          lab_kit_required?: boolean | null
          lab_kit_id?: string | null
          accession_number?: string | null
          airway_bill_number?: string | null
          lab_kit_shipped_date?: string | null
          
          // Drug Accountability
          drug_dispensing_required?: boolean | null
          previous_dispense_date?: string | null
          tablets_dispensed?: number | null
          tablets_returned?: number | null
          ip_start_date?: string | null
          ip_last_dose_date?: string | null
          ip_dispensed?: number | null
          ip_returned?: number | null
          ip_id?: string | null
          
          // Local Labs
          local_labs_required?: boolean | null
          local_labs_completed?: boolean | null
          
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      study_sections: {
        Row: {
          id: string
          study_id: string
          code: string
          name: string | null
          order_index: number | null
          anchor_type: 'enrollment_date' | 'randomization_date' | 'first_dose_date' | 'section_anchor_date' | 'previous_section_end_date' | 'custom_event_date'
          anchor_offset_days: number | null
          dosing_frequency: 'QD' | 'BID' | 'TID' | 'QID' | 'weekly' | 'custom' | null
          compliance_threshold: number | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          study_id: string
          code: string
          name?: string | null
          order_index?: number | null
          anchor_type?: 'enrollment_date' | 'randomization_date' | 'first_dose_date' | 'section_anchor_date' | 'previous_section_end_date' | 'custom_event_date'
          anchor_offset_days?: number | null
          dosing_frequency?: 'QD' | 'BID' | 'TID' | 'QID' | 'weekly' | 'custom' | null
          compliance_threshold?: number | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          study_id?: string
          code?: string
          name?: string | null
          order_index?: number | null
          anchor_type?: 'enrollment_date' | 'randomization_date' | 'first_dose_date' | 'section_anchor_date' | 'previous_section_end_date' | 'custom_event_date'
          anchor_offset_days?: number | null
          dosing_frequency?: 'QD' | 'BID' | 'TID' | 'QID' | 'weekly' | 'custom' | null
          compliance_threshold?: number | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
      }
      subject_sections: {
        Row: {
          id: string
          subject_id: string
          study_section_id: string
          anchor_date: string
          started_at: string | null
          ended_at: string | null
          status: 'planned' | 'active' | 'completed' | 'terminated'
          transition_reason: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          subject_id: string
          study_section_id: string
          anchor_date: string
          started_at?: string | null
          ended_at?: string | null
          status?: 'planned' | 'active' | 'completed' | 'terminated'
          transition_reason?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          subject_id?: string
          study_section_id?: string
          anchor_date?: string
          started_at?: string | null
          ended_at?: string | null
          status?: 'planned' | 'active' | 'completed' | 'terminated'
          transition_reason?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
         updated_at?: string
       }
      }
      visit_schedule_history: {
        Row: {
          id: string
          visit_id: string
          old_date: string | null
          new_date: string | null
          reason: string | null
          changed_by: string | null
          changed_at: string | null
        }
        Insert: {
          id?: string
          visit_id: string
          old_date?: string | null
          new_date?: string | null
          reason?: string | null
          changed_by?: string | null
          changed_at?: string | null
        }
        Update: {
          id?: string
          visit_id?: string
          old_date?: string | null
          new_date?: string | null
          reason?: string | null
          changed_by?: string | null
          changed_at?: string | null
        }
      }
      study_kit_types: {
        Row: {
          id: string
          study_id: string
          name: string
          description: string | null
          buffer_days: number | null
          buffer_count: number | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          study_id: string
          name: string
          description?: string | null
          buffer_days?: number | null
          buffer_count?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          study_id?: string
          name?: string
          description?: string | null
          buffer_days?: number | null
          buffer_count?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      visit_kit_requirements: {
        Row: {
          id: string
          study_id: string
          visit_schedule_id: string
          kit_type_id: string
          quantity: number
          is_optional: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          study_id: string
          visit_schedule_id: string
          kit_type_id: string
          quantity?: number
          is_optional?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          study_id?: string
          visit_schedule_id?: string
          kit_type_id?: string
          quantity?: number
          is_optional?: boolean
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
      lab_kits: {
        Row: {
          id: string
          study_id: string
          visit_schedule_id: string | null
          accession_number: string
          kit_type: string | null
          kit_type_id: string | null
          lot_number: string | null
          expiration_date: string | null
          status: 'available' | 'assigned' | 'used' | 'pending_shipment' | 'shipped' | 'delivered' | 'expired' | 'destroyed' | 'archived'
          received_date: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          study_id: string
          visit_schedule_id?: string | null
          accession_number: string
          kit_type?: string | null
          kit_type_id?: string | null
          lot_number?: string | null
          expiration_date?: string | null
          status?: 'available' | 'assigned' | 'used' | 'pending_shipment' | 'shipped' | 'delivered' | 'expired' | 'destroyed' | 'archived'
          received_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          study_id?: string
          visit_schedule_id?: string | null
          accession_number?: string
          kit_type?: string | null
          kit_type_id?: string | null
          lot_number?: string | null
          expiration_date?: string | null
          status?: 'available' | 'assigned' | 'used' | 'pending_shipment' | 'shipped' | 'delivered' | 'expired' | 'destroyed' | 'archived'
          received_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      lab_kit_orders: {
        Row: {
          id: string
          study_id: string
          kit_type_id: string | null
          quantity: number
          vendor: string | null
          expected_arrival: string | null
          status: 'pending' | 'received' | 'cancelled'
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          received_date: string | null
        }
        Insert: {
          id?: string
          study_id: string
          kit_type_id?: string | null
          quantity: number
          vendor?: string | null
          expected_arrival?: string | null
          status?: 'pending' | 'received' | 'cancelled'
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          received_date?: string | null
        }
        Update: {
          id?: string
          study_id?: string
          kit_type_id?: string | null
          quantity?: number
          vendor?: string | null
          expected_arrival?: string | null
          status?: 'pending' | 'received' | 'cancelled'
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          received_date?: string | null
        }
      }
      lab_kit_shipments: {
        Row: {
          id: string
          lab_kit_id: string | null
          accession_number: string | null
          subject_visit_id: string | null
          airway_bill_number: string
          carrier: 'fedex' | 'ups' | 'other'
          shipped_date: string | null
          estimated_delivery: string | null
          actual_delivery: string | null
          tracking_status: string | null
          tracking_details: Json | null
          destination_address: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lab_kit_id?: string | null
          accession_number?: string | null
          subject_visit_id?: string | null
          airway_bill_number: string
          carrier?: 'fedex' | 'ups' | 'other'
          shipped_date?: string | null
          estimated_delivery?: string | null
          actual_delivery?: string | null
          tracking_status?: string | null
          tracking_details?: Json | null
          destination_address?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lab_kit_id?: string | null
          accession_number?: string | null
          subject_visit_id?: string | null
          airway_bill_number?: string
          carrier?: 'fedex' | 'ups' | 'other'
          shipped_date?: string | null
          estimated_delivery?: string | null
          actual_delivery?: string | null
          tracking_status?: string | null
          tracking_details?: Json | null
          destination_address?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      lab_kit_usage: {
        Row: {
          id: string
          lab_kit_id: string
          subject_visit_id: string
          used_date: string
          used_by_user_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lab_kit_id: string
          subject_visit_id: string
          used_date?: string
          used_by_user_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lab_kit_id?: string
          subject_visit_id?: string
          used_date?: string
          used_by_user_id?: string | null
          notes?: string | null
          created_at?: string
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

export type StudySection = Database['public']['Tables']['study_sections']['Row']
export type StudySectionInsert = Database['public']['Tables']['study_sections']['Insert']
export type StudySectionUpdate = Database['public']['Tables']['study_sections']['Update']

export type SubjectSection = Database['public']['Tables']['subject_sections']['Row']
export type SubjectSectionInsert = Database['public']['Tables']['subject_sections']['Insert']
export type SubjectSectionUpdate = Database['public']['Tables']['subject_sections']['Update']

export type LabKit = Database['public']['Tables']['lab_kits']['Row']
export type LabKitInsert = Database['public']['Tables']['lab_kits']['Insert']
export type LabKitUpdate = Database['public']['Tables']['lab_kits']['Update']

export type LabKitOrder = Database['public']['Tables']['lab_kit_orders']['Row']
export type LabKitOrderInsert = Database['public']['Tables']['lab_kit_orders']['Insert']
export type LabKitOrderUpdate = Database['public']['Tables']['lab_kit_orders']['Update']

export type LabKitShipment = Database['public']['Tables']['lab_kit_shipments']['Row']
export type LabKitShipmentInsert = Database['public']['Tables']['lab_kit_shipments']['Insert']
export type LabKitShipmentUpdate = Database['public']['Tables']['lab_kit_shipments']['Update']

export type LabKitUsage = Database['public']['Tables']['lab_kit_usage']['Row']
export type LabKitUsageInsert = Database['public']['Tables']['lab_kit_usage']['Insert']
export type LabKitUsageUpdate = Database['public']['Tables']['lab_kit_usage']['Update']

export type VisitScheduleHistory = Database['public']['Tables']['visit_schedule_history']['Row']
export type VisitScheduleHistoryInsert = Database['public']['Tables']['visit_schedule_history']['Insert']
export type VisitScheduleHistoryUpdate = Database['public']['Tables']['visit_schedule_history']['Update']

export type StudyKitType = Database['public']['Tables']['study_kit_types']['Row']
export type StudyKitTypeInsert = Database['public']['Tables']['study_kit_types']['Insert']
export type StudyKitTypeUpdate = Database['public']['Tables']['study_kit_types']['Update']

export type VisitKitRequirement = Database['public']['Tables']['visit_kit_requirements']['Row']
export type VisitKitRequirementInsert = Database['public']['Tables']['visit_kit_requirements']['Insert']
export type VisitKitRequirementUpdate = Database['public']['Tables']['visit_kit_requirements']['Update']
