export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_contacts: {
        Row: {
          account_id: string
          active: boolean
          email: string
          id: string
          job_title: string | null
          name: string
        }
        Insert: {
          account_id: string
          active?: boolean
          email: string
          id?: string
          job_title?: string | null
          name: string
        }
        Update: {
          account_id?: string
          active?: boolean
          email?: string
          id?: string
          job_title?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_members: {
        Row: {
          account_id: string
          user_id: string
        }
        Insert: {
          account_id: string
          user_id: string
        }
        Update: {
          account_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          active: boolean
          calendar_id: string
          id: string
          kam_id: string | null
          name: string
          sla_policy_id: string
        }
        Insert: {
          active?: boolean
          calendar_id: string
          id?: string
          kam_id?: string | null
          name: string
          sla_policy_id: string
        }
        Update: {
          active?: boolean
          calendar_id?: string
          id?: string
          kam_id?: string | null
          name?: string
          sla_policy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "business_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_kam_id_fkey"
            columns: ["kam_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_sla_policy_id_fkey"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      actions: {
        Row: {
          cause_id: string | null
          created_at: string
          done_at: string | null
          due_date: string
          evidence_note: string | null
          gates_solution: boolean | null
          how: string | null
          how_much: number | null
          id: string
          occurrence_id: string | null
          owner_id: string
          problem_id: string | null
          status: Database["public"]["Enums"]["action_status"]
          type: Database["public"]["Enums"]["action_type"]
          what: string
          where_text: string | null
          why: string | null
        }
        Insert: {
          cause_id?: string | null
          created_at?: string
          done_at?: string | null
          due_date: string
          evidence_note?: string | null
          gates_solution?: boolean | null
          how?: string | null
          how_much?: number | null
          id?: string
          occurrence_id?: string | null
          owner_id: string
          problem_id?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          type: Database["public"]["Enums"]["action_type"]
          what: string
          where_text?: string | null
          why?: string | null
        }
        Update: {
          cause_id?: string | null
          created_at?: string
          done_at?: string | null
          due_date?: string
          evidence_note?: string | null
          gates_solution?: boolean | null
          how?: string | null
          how_much?: number | null
          id?: string
          occurrence_id?: string | null
          owner_id?: string
          problem_id?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          type?: Database["public"]["Enums"]["action_type"]
          what?: string
          where_text?: string | null
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actions_cause_id_fkey"
            columns: ["cause_id"]
            isOneToOne: false
            referencedRelation: "causes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "v_problem_list"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          action_id: string | null
          created_at: string
          filename: string
          id: string
          mime_type: string | null
          occurrence_id: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
          visibility: Database["public"]["Enums"]["event_visibility"]
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          filename: string
          id?: string
          mime_type?: string | null
          occurrence_id?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"]
        }
        Update: {
          action_id?: string | null
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string | null
          occurrence_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "attachments_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_calendars: {
        Row: {
          id: string
          name: string
          timezone: string
          work_days: number[]
          work_end: string
          work_start: string
        }
        Insert: {
          id?: string
          name: string
          timezone?: string
          work_days?: number[]
          work_end?: string
          work_start?: string
        }
        Update: {
          id?: string
          name?: string
          timezone?: string
          work_days?: number[]
          work_end?: string
          work_start?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      causes: {
        Row: {
          category: Database["public"]["Enums"]["cause_6m"] | null
          code: string
          created_at: string
          created_by: string | null
          description: string
          evidence: string | null
          id: string
          kind: Database["public"]["Enums"]["cause_kind"]
          occurrence_id: string | null
          problem_id: string | null
          status: Database["public"]["Enums"]["cause_status"]
          whys: string[]
        }
        Insert: {
          category?: Database["public"]["Enums"]["cause_6m"] | null
          code: string
          created_at?: string
          created_by?: string | null
          description: string
          evidence?: string | null
          id?: string
          kind: Database["public"]["Enums"]["cause_kind"]
          occurrence_id?: string | null
          problem_id?: string | null
          status?: Database["public"]["Enums"]["cause_status"]
          whys?: string[]
        }
        Update: {
          category?: Database["public"]["Enums"]["cause_6m"] | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string
          evidence?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["cause_kind"]
          occurrence_id?: string | null
          problem_id?: string | null
          status?: Database["public"]["Enums"]["cause_status"]
          whys?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "causes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "causes_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "causes_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "causes_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "causes_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "causes_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "v_problem_list"
            referencedColumns: ["id"]
          },
        ]
      }
      config_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          note: string | null
          old_data: Json | null
          record_key: string
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          note?: string | null
          old_data?: Json | null
          record_key: string
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          note?: string | null
          old_data?: Json | null
          record_key?: string
          table_name?: string
        }
        Relationships: []
      }
      email_dispatches: {
        Row: {
          attempts: number
          contact_id: string | null
          created_at: string
          data: Json
          id: string
          idempotency_key: string
          last_error: string | null
          link_purpose: string | null
          next_attempt_at: string
          occurrence_id: string | null
          problem_id: string | null
          recipient_kind: string
          sent_at: string | null
          status: string
          summary: string
          template: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          contact_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          idempotency_key: string
          last_error?: string | null
          link_purpose?: string | null
          next_attempt_at?: string
          occurrence_id?: string | null
          problem_id?: string | null
          recipient_kind: string
          sent_at?: string | null
          status?: string
          summary: string
          template: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          contact_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          idempotency_key?: string
          last_error?: string | null
          link_purpose?: string | null
          next_attempt_at?: string
          occurrence_id?: string | null
          problem_id?: string | null
          recipient_kind?: string
          sent_at?: string | null
          status?: string
          summary?: string
          template?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_dispatches_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "account_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_dispatches_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_dispatches_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_dispatches_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_dispatches_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_dispatches_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "v_problem_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_dispatches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          answered_at: string | null
          ces: number | null
          comment: string | null
          csat: number | null
          cycle: number
          id: string
          missing_text: string | null
          occurrence_id: string
          reminders_sent: number
          resolved: Database["public"]["Enums"]["eval_resolved"] | null
          sent_at: string
          token_expires_at: string
          token_hash: string
        }
        Insert: {
          answered_at?: string | null
          ces?: number | null
          comment?: string | null
          csat?: number | null
          cycle?: number
          id?: string
          missing_text?: string | null
          occurrence_id: string
          reminders_sent?: number
          resolved?: Database["public"]["Enums"]["eval_resolved"] | null
          sent_at?: string
          token_expires_at: string
          token_hash: string
        }
        Update: {
          answered_at?: string | null
          ces?: number | null
          comment?: string | null
          csat?: number | null
          cycle?: number
          id?: string
          missing_text?: string | null
          occurrence_id?: string
          reminders_sent?: number
          resolved?: Database["public"]["Enums"]["eval_resolved"] | null
          sent_at?: string
          token_expires_at?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          calendar_id: string
          day: string
          description: string | null
        }
        Insert: {
          calendar_id: string
          day: string
          description?: string | null
        }
        Update: {
          calendar_id?: string
          day?: string
          description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holidays_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "business_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          occurrence_id: string | null
          problem_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          occurrence_id?: string | null
          problem_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          occurrence_id?: string | null
          problem_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "v_problem_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrence_contestations: {
        Row: {
          body: string
          created_at: string
          decision: string | null
          id: string
          occurrence_id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          body: string
          created_at?: string
          decision?: string | null
          id?: string
          occurrence_id: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          decision?: string | null
          id?: string
          occurrence_id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_contestations_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_contestations_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_contestations_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_contestations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrence_events: {
        Row: {
          author_id: string | null
          body: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["occ_status"] | null
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          metadata: Json
          occurrence_id: string
          to_status: Database["public"]["Enums"]["occ_status"] | null
          visibility: Database["public"]["Enums"]["event_visibility"]
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["occ_status"] | null
          id?: string
          kind: Database["public"]["Enums"]["event_kind"]
          metadata?: Json
          occurrence_id: string
          to_status?: Database["public"]["Enums"]["occ_status"] | null
          visibility: Database["public"]["Enums"]["event_visibility"]
        }
        Update: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["occ_status"] | null
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          metadata?: Json
          occurrence_id?: string
          to_status?: Database["public"]["Enums"]["occ_status"] | null
          visibility?: Database["public"]["Enums"]["event_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_events_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_events_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_events_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_events_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrence_sla_cycles: {
        Row: {
          cycle: number
          due_at: string
          ended_at: string | null
          occurrence_id: string
          paused_business_minutes: number
          resolution_breached: boolean
          resolution_minutes: number
          severity: Database["public"]["Enums"]["occ_severity"]
          solution_proposed_at: string | null
          started_at: string
        }
        Insert: {
          cycle: number
          due_at: string
          ended_at?: string | null
          occurrence_id: string
          paused_business_minutes?: number
          resolution_breached?: boolean
          resolution_minutes: number
          severity: Database["public"]["Enums"]["occ_severity"]
          solution_proposed_at?: string | null
          started_at: string
        }
        Update: {
          cycle?: number
          due_at?: string
          ended_at?: string | null
          occurrence_id?: string
          paused_business_minutes?: number
          resolution_breached?: boolean
          resolution_minutes?: number
          severity?: Database["public"]["Enums"]["occ_severity"]
          solution_proposed_at?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_sla_cycles_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_sla_cycles_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_sla_cycles_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrences: {
        Row: {
          account_id: string
          assignee_id: string | null
          category_id: string
          channel: Database["public"]["Enums"]["occ_channel"]
          classification_confirmed_at: string | null
          classification_confirmed_by: string | null
          closed_at: string | null
          contact_id: string
          created_at: string
          created_by: string
          customer_expectation: string
          description: string
          financial_impact: number | null
          first_response_at: string | null
          first_response_breached: boolean
          first_response_due_at: string
          id: string
          impact: Database["public"]["Enums"]["occ_level"]
          next_update_due_at: string | null
          occurred_at: string | null
          paused_business_minutes: number
          paused_from_status: Database["public"]["Enums"]["occ_status"] | null
          paused_since: string | null
          problem_id: string | null
          protocol: string
          references_text: string | null
          reopen_count: number
          resolution_breached: boolean
          resolution_due_at: string
          resolution_started_at: string
          severity: Database["public"]["Enums"]["occ_severity"]
          solution_proposed_at: string | null
          solution_text: string | null
          status: Database["public"]["Enums"]["occ_status"]
          subcategory_id: string | null
          subject: string
          type: Database["public"]["Enums"]["occ_type"]
          unfounded_justification: string | null
          updated_at: string
          urgency: Database["public"]["Enums"]["occ_level"]
        }
        Insert: {
          account_id: string
          assignee_id?: string | null
          category_id: string
          channel: Database["public"]["Enums"]["occ_channel"]
          classification_confirmed_at?: string | null
          classification_confirmed_by?: string | null
          closed_at?: string | null
          contact_id: string
          created_at?: string
          created_by: string
          customer_expectation: string
          description: string
          financial_impact?: number | null
          first_response_at?: string | null
          first_response_breached?: boolean
          first_response_due_at: string
          id?: string
          impact: Database["public"]["Enums"]["occ_level"]
          next_update_due_at?: string | null
          occurred_at?: string | null
          paused_business_minutes?: number
          paused_from_status?: Database["public"]["Enums"]["occ_status"] | null
          paused_since?: string | null
          problem_id?: string | null
          protocol: string
          references_text?: string | null
          reopen_count?: number
          resolution_breached?: boolean
          resolution_due_at: string
          resolution_started_at: string
          severity: Database["public"]["Enums"]["occ_severity"]
          solution_proposed_at?: string | null
          solution_text?: string | null
          status?: Database["public"]["Enums"]["occ_status"]
          subcategory_id?: string | null
          subject: string
          type: Database["public"]["Enums"]["occ_type"]
          unfounded_justification?: string | null
          updated_at?: string
          urgency: Database["public"]["Enums"]["occ_level"]
        }
        Update: {
          account_id?: string
          assignee_id?: string | null
          category_id?: string
          channel?: Database["public"]["Enums"]["occ_channel"]
          classification_confirmed_at?: string | null
          classification_confirmed_by?: string | null
          closed_at?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string
          customer_expectation?: string
          description?: string
          financial_impact?: number | null
          first_response_at?: string | null
          first_response_breached?: boolean
          first_response_due_at?: string
          id?: string
          impact?: Database["public"]["Enums"]["occ_level"]
          next_update_due_at?: string | null
          occurred_at?: string | null
          paused_business_minutes?: number
          paused_from_status?: Database["public"]["Enums"]["occ_status"] | null
          paused_since?: string | null
          problem_id?: string | null
          protocol?: string
          references_text?: string | null
          reopen_count?: number
          resolution_breached?: boolean
          resolution_due_at?: string
          resolution_started_at?: string
          severity?: Database["public"]["Enums"]["occ_severity"]
          solution_proposed_at?: string | null
          solution_text?: string | null
          status?: Database["public"]["Enums"]["occ_status"]
          subcategory_id?: string | null
          subject?: string
          type?: Database["public"]["Enums"]["occ_type"]
          unfounded_justification?: string | null
          updated_at?: string
          urgency?: Database["public"]["Enums"]["occ_level"]
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_classification_confirmed_by_fkey"
            columns: ["classification_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_contact_id_account_id_fkey"
            columns: ["contact_id", "account_id"]
            isOneToOne: false
            referencedRelation: "account_contacts"
            referencedColumns: ["id", "account_id"]
          },
          {
            foreignKeyName: "occurrences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "v_problem_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      problem_events: {
        Row: {
          author_id: string | null
          body: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["problem_status"] | null
          id: string
          kind: string
          metadata: Json
          problem_id: string
          to_status: Database["public"]["Enums"]["problem_status"] | null
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["problem_status"] | null
          id?: string
          kind: string
          metadata?: Json
          problem_id: string
          to_status?: Database["public"]["Enums"]["problem_status"] | null
        }
        Update: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["problem_status"] | null
          id?: string
          kind?: string
          metadata?: Json
          problem_id?: string
          to_status?: Database["public"]["Enums"]["problem_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "problem_events_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_events_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_events_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "v_problem_list"
            referencedColumns: ["id"]
          },
        ]
      }
      problems: {
        Row: {
          account_id: string | null
          category_id: string | null
          closed_at: string | null
          code: string
          created_at: string
          created_by: string | null
          effectiveness_checked_at: string | null
          effectiveness_criteria: string | null
          effectiveness_due_date: string | null
          effectiveness_effective: boolean | null
          effectiveness_evidence: string | null
          id: string
          owner_id: string | null
          status: Database["public"]["Enums"]["problem_status"]
          title: string
        }
        Insert: {
          account_id?: string | null
          category_id?: string | null
          closed_at?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          effectiveness_checked_at?: string | null
          effectiveness_criteria?: string | null
          effectiveness_due_date?: string | null
          effectiveness_effective?: boolean | null
          effectiveness_evidence?: string | null
          id?: string
          owner_id?: string | null
          status?: Database["public"]["Enums"]["problem_status"]
          title: string
        }
        Update: {
          account_id?: string | null
          category_id?: string | null
          closed_at?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          effectiveness_checked_at?: string | null
          effectiveness_criteria?: string | null
          effectiveness_due_date?: string | null
          effectiveness_effective?: boolean | null
          effectiveness_evidence?: string | null
          id?: string
          owner_id?: string | null
          status?: Database["public"]["Enums"]["problem_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "problems_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problems_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problems_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problems_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          full_name: string
          id: string
        }
        Insert: {
          active?: boolean
          full_name: string
          id: string
        }
        Update: {
          active?: boolean
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      protocol_counters: {
        Row: {
          last_number: number
          year: number
        }
        Insert: {
          last_number?: number
          year: number
        }
        Update: {
          last_number?: number
          year?: number
        }
        Relationships: []
      }
      public_link_attempts: {
        Row: {
          attempts: number
          key: string
          window_start: string
        }
        Insert: {
          attempts?: number
          key: string
          window_start?: string
        }
        Update: {
          attempts?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      public_links: {
        Row: {
          created_at: string
          dispatch_id: string | null
          evaluation_id: string | null
          expires_at: string | null
          id: string
          occurrence_id: string
          purpose: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          dispatch_id?: string | null
          evaluation_id?: string | null
          expires_at?: string | null
          id?: string
          occurrence_id: string
          purpose: string
          token_hash: string
        }
        Update: {
          created_at?: string
          dispatch_id?: string | null
          evaluation_id?: string | null
          expires_at?: string | null
          id?: string
          occurrence_id?: string
          purpose?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_links_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "email_dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_links_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_links_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_links_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_links_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_alerts: {
        Row: {
          alert_key: string
          occurrence_id: string
          sent_at: string
        }
        Insert: {
          alert_key: string
          occurrence_id: string
          sent_at?: string
        }
        Update: {
          alert_key?: string
          occurrence_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_alerts_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_alerts_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_alerts_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "v_occurrence_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      sla_targets: {
        Row: {
          first_response_minutes: number
          policy_id: string
          resolution_minutes: number
          severity: Database["public"]["Enums"]["occ_severity"]
          update_interval_minutes: number
        }
        Insert: {
          first_response_minutes: number
          policy_id: string
          resolution_minutes: number
          severity: Database["public"]["Enums"]["occ_severity"]
          update_interval_minutes: number
        }
        Update: {
          first_response_minutes?: number
          policy_id?: string
          resolution_minutes?: number
          severity?: Database["public"]["Enums"]["occ_severity"]
          update_interval_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "sla_targets_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_occurrence_list: {
        Row: {
          account_id: string | null
          account_name: string | null
          assignee_id: string | null
          assignee_name: string | null
          category_id: string | null
          category_name: string | null
          consumed_percent: number | null
          created_at: string | null
          evaluation_answered_at: string | null
          evaluation_ces: number | null
          evaluation_csat: number | null
          evaluation_resolved:
            | Database["public"]["Enums"]["eval_resolved"]
            | null
          evaluation_sent: boolean | null
          first_response_at: string | null
          first_response_breached: boolean | null
          first_response_due_at: string | null
          first_response_minutes: number | null
          first_response_overdue: boolean | null
          id: string | null
          paused_since: string | null
          problem_id: string | null
          protocol: string | null
          reopen_count: number | null
          resolution_breached: boolean | null
          resolution_due_at: string | null
          search_text: string | null
          severity: Database["public"]["Enums"]["occ_severity"] | null
          sla_state: string | null
          sort_rank: number | null
          status: Database["public"]["Enums"]["occ_status"] | null
          subject: string | null
          type: Database["public"]["Enums"]["occ_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "v_problem_list"
            referencedColumns: ["id"]
          },
        ]
      }
      v_occurrence_sla: {
        Row: {
          consumed_percent: number | null
          first_response_due_at: string | null
          id: string | null
          resolution_due_at: string | null
          sla_state: string | null
        }
        Relationships: []
      }
      v_problem_list: {
        Row: {
          account_id: string | null
          account_name: string | null
          actions_done: number | null
          actions_total: number | null
          category_id: string | null
          category_name: string | null
          closed_at: string | null
          code: string | null
          created_at: string | null
          effectiveness_due_date: string | null
          effectiveness_effective: boolean | null
          id: string | null
          occurrence_count: number | null
          owner_id: string | null
          owner_name: string | null
          status: Database["public"]["Enums"]["problem_status"] | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "problems_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problems_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problems_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      account_team: { Args: { p_account_id: string }; Returns: Json }
      add_business_minutes: {
        Args: { p_calendar: string; p_minutes: number; p_start: string }
        Returns: string
      }
      admin_staff: { Args: never; Returns: Json }
      anonymize_contact: {
        Args: { p_contact_id: string; p_reference: string }
        Returns: undefined
      }
      answer_customer_evaluation: {
        Args: {
          p_ces: number
          p_comment: string
          p_csat: number
          p_hash: string
          p_missing: string
          p_reopen?: boolean
          p_resolved: Database["public"]["Enums"]["eval_resolved"]
        }
        Returns: Json
      }
      available_problem_transitions: {
        Args: { p_problem_id: string }
        Returns: Json
      }
      available_transitions: {
        Args: { p_occurrence_id: string }
        Returns: Json
      }
      backlog_aging: { Args: { p_account_id?: string }; Returns: Json }
      business_minutes_between: {
        Args: { p_calendar: string; p_from: string; p_to: string }
        Returns: number
      }
      calculate_severity: {
        Args: {
          p_impact: Database["public"]["Enums"]["occ_level"]
          p_urgency: Database["public"]["Enums"]["occ_level"]
        }
        Returns: Database["public"]["Enums"]["occ_severity"]
      }
      can_manage_problem: { Args: { p_problem_id: string }; Returns: boolean }
      can_manage_work: {
        Args: { p_occ: string; p_problem: string }
        Returns: boolean
      }
      claim_email_dispatches: {
        Args: { p_limit?: number; p_occurrence_id?: string }
        Returns: Json
      }
      communicate_occurrence: {
        Args: {
          p_body: string
          p_kind: Database["public"]["Enums"]["event_kind"]
          p_occurrence_id: string
        }
        Returns: undefined
      }
      complete_email_dispatch: {
        Args: {
          p_error?: string
          p_id: string
          p_outcome: string
          p_retry_after?: number
        }
        Returns: undefined
      }
      create_problem: {
        Args: {
          p_account_id: string
          p_category_id: string
          p_occurrence_id?: string
          p_title: string
        }
        Returns: string
      }
      create_sla_policy: {
        Args: { p_copy_from: string; p_name: string }
        Returns: string
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      dashboard_kpis: {
        Args: { p_account_id?: string; p_from: string; p_to: string }
        Returns: Json
      }
      enqueue_customer_email: {
        Args: {
          p_copy_kam?: boolean
          p_data: Json
          p_key: string
          p_link?: string
          p_occurrence: string
          p_summary: string
          p_template: string
        }
        Returns: undefined
      }
      escalate_occurrence: {
        Args: { p_occurrence_id: string; p_reason: string }
        Returns: undefined
      }
      evidence_object_access: { Args: { p_name: string }; Returns: boolean }
      fail_problem_effectiveness: {
        Args: {
          p_occurrence_id?: string
          p_problem_id: string
          p_reason: string
        }
        Returns: undefined
      }
      has_account_access: { Args: { p_account_id: string }; Returns: boolean }
      has_attachment_parent_access: {
        Args: { p_action: string; p_occ: string }
        Returns: boolean
      }
      has_occurrence_access: { Args: { p_id: string }; Returns: boolean }
      has_problem_access: { Args: { p_id: string }; Returns: boolean }
      has_work_access: {
        Args: { p_occ: string; p_problem: string }
        Returns: boolean
      }
      is_config_admin: { Args: never; Returns: boolean }
      issue_public_link: {
        Args: { p_dispatch_id: string; p_hash: string }
        Returns: Json
      }
      kpi_window: {
        Args: { p_account?: string; p_from: string; p_to: string }
        Returns: Json
      }
      limit_public_link: { Args: { p_key: string }; Returns: boolean }
      link_occurrence_to_problem: {
        Args: { p_occurrence_id: string; p_problem_id: string }
        Returns: undefined
      }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      notify_ops_managers: {
        Args: {
          p_body: string
          p_email?: boolean
          p_key: string
          p_kind: string
          p_occurrence: string
          p_problem: string
          p_title: string
        }
        Returns: number
      }
      notify_user: {
        Args: {
          p_body: string
          p_email?: boolean
          p_key: string
          p_kind: string
          p_occurrence: string
          p_problem: string
          p_title: string
          p_user: string
        }
        Returns: boolean
      }
      occurrence_pareto: { Args: { p_account_id?: string }; Returns: Json }
      occurrence_recurrence: {
        Args: { p_occurrence_id: string }
        Returns: Json
      }
      preview_sla: {
        Args: {
          p_account_id: string
          p_impact: Database["public"]["Enums"]["occ_level"]
          p_urgency: Database["public"]["Enums"]["occ_level"]
        }
        Returns: Json
      }
      problem_team: { Args: { p_problem_id: string }; Returns: Json }
      reassign_occurrence: {
        Args: { p_occurrence_id: string; p_reason: string; p_user_id: string }
        Returns: undefined
      }
      reopen_occurrence_from_customer: {
        Args: { p_occurrence_id: string; p_reason: string }
        Returns: Json
      }
      resend_evaluation_invite: {
        Args: { p_occurrence_id: string }
        Returns: undefined
      }
      review_unfounded_contestation: {
        Args: { p_decision: string; p_id: string; p_reason: string }
        Returns: undefined
      }
      revise_occurrence_classification: {
        Args: {
          p_category_id: string
          p_impact: Database["public"]["Enums"]["occ_level"]
          p_occurrence_id: string
          p_reason: string
          p_urgency: Database["public"]["Enums"]["occ_level"]
        }
        Returns: undefined
      }
      sla_tick: { Args: never; Returns: undefined }
      sp_datetime: { Args: { p: string }; Returns: string }
      staff_names: { Args: { p_ids: string[] }; Returns: Json }
      submit_contestation_by_link: {
        Args: { p_body: string; p_hash: string }
        Returns: Json
      }
      submit_unfounded_contestation: {
        Args: { p_body: string; p_occurrence_id: string }
        Returns: string
      }
      transition_occurrence: {
        Args: { p_action: string; p_occurrence_id: string; p_payload?: Json }
        Returns: Json
      }
      transition_problem: {
        Args: { p_action: string; p_payload?: Json; p_problem_id: string }
        Returns: Json
      }
      user_has_account_access: {
        Args: { p_account: string; p_user: string }
        Returns: boolean
      }
    }
    Enums: {
      action_status: "open" | "in_progress" | "done" | "cancelled"
      action_type: "containment" | "correction" | "corrective" | "preventive"
      cause_6m:
        | "method"
        | "machine"
        | "manpower"
        | "material"
        | "measurement"
        | "environment"
      cause_kind: "root" | "contributing"
      cause_status: "hypothesis" | "validating" | "confirmed" | "discarded"
      eval_resolved: "yes" | "partial" | "no"
      event_kind:
        | "customer_update"
        | "customer_question"
        | "internal_note"
        | "status_change"
        | "customer_reply"
        | "solution"
        | "evaluation"
        | "system"
      event_visibility: "customer" | "internal" | "system"
      occ_channel:
        | "portal"
        | "email"
        | "phone"
        | "whatsapp"
        | "account_meeting"
        | "site_visit"
      occ_level: "high" | "medium" | "low"
      occ_severity: "S1" | "S2" | "S3" | "S4"
      occ_status:
        | "registered"
        | "in_analysis"
        | "in_treatment"
        | "awaiting_customer"
        | "solution_proposed"
        | "reopened"
        | "closed_resolved"
        | "closed_no_evaluation"
        | "closed_unfounded"
      occ_type: "complaint" | "incident" | "request"
      problem_status:
        | "open"
        | "analysis"
        | "action_plan"
        | "effectiveness_check"
        | "closed"
        | "cancelled"
      user_role: "analyst" | "kam" | "ops_manager" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_status: ["open", "in_progress", "done", "cancelled"],
      action_type: ["containment", "correction", "corrective", "preventive"],
      cause_6m: [
        "method",
        "machine",
        "manpower",
        "material",
        "measurement",
        "environment",
      ],
      cause_kind: ["root", "contributing"],
      cause_status: ["hypothesis", "validating", "confirmed", "discarded"],
      eval_resolved: ["yes", "partial", "no"],
      event_kind: [
        "customer_update",
        "customer_question",
        "internal_note",
        "status_change",
        "customer_reply",
        "solution",
        "evaluation",
        "system",
      ],
      event_visibility: ["customer", "internal", "system"],
      occ_channel: [
        "portal",
        "email",
        "phone",
        "whatsapp",
        "account_meeting",
        "site_visit",
      ],
      occ_level: ["high", "medium", "low"],
      occ_severity: ["S1", "S2", "S3", "S4"],
      occ_status: [
        "registered",
        "in_analysis",
        "in_treatment",
        "awaiting_customer",
        "solution_proposed",
        "reopened",
        "closed_resolved",
        "closed_no_evaluation",
        "closed_unfounded",
      ],
      occ_type: ["complaint", "incident", "request"],
      problem_status: [
        "open",
        "analysis",
        "action_plan",
        "effectiveness_check",
        "closed",
        "cancelled",
      ],
      user_role: ["analyst", "kam", "ops_manager", "admin"],
    },
  },
} as const
