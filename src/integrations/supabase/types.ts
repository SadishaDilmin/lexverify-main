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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          position: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          team: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          position: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          team?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          position?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          team?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string
          event_type: string
          id: string
          message: string
          metadata: Json | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_feedback: {
        Row: {
          agent_assessment: string | null
          agent_response: string | null
          agent_version: string
          case_id: string
          case_reference: string
          created_at: string
          enhancement_id: string | null
          enhancement_summary: string | null
          evidence_references: string | null
          feedback_type: string | null
          id: string
          is_enhancement_candidate: boolean
          logged_as_feedback: boolean
          mode: string
          proposed_correction: string | null
          review_reason: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string | null
          user_email: string
          user_id: string
          user_message: string
          user_name: string
          user_position: string
        }
        Insert: {
          agent_assessment?: string | null
          agent_response?: string | null
          agent_version?: string
          case_id: string
          case_reference: string
          created_at?: string
          enhancement_id?: string | null
          enhancement_summary?: string | null
          evidence_references?: string | null
          feedback_type?: string | null
          id?: string
          is_enhancement_candidate?: boolean
          logged_as_feedback?: boolean
          mode: string
          proposed_correction?: string | null
          review_reason?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          user_email: string
          user_id: string
          user_message: string
          user_name: string
          user_position?: string
        }
        Update: {
          agent_assessment?: string | null
          agent_response?: string | null
          agent_version?: string
          case_id?: string
          case_reference?: string
          created_at?: string
          enhancement_id?: string | null
          enhancement_summary?: string | null
          evidence_references?: string | null
          feedback_type?: string | null
          id?: string
          is_enhancement_candidate?: boolean
          logged_as_feedback?: boolean
          mode?: string
          proposed_correction?: string | null
          review_reason?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          user_email?: string
          user_id?: string
          user_message?: string
          user_name?: string
          user_position?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_feedback_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "agent_feedback_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_interest: {
        Row: {
          agent_type: string
          created_at: string
          email: string
          firm_name: string
          full_name: string
          id: string
          message: string | null
          status: string
        }
        Insert: {
          agent_type: string
          created_at?: string
          email: string
          firm_name?: string
          full_name: string
          id?: string
          message?: string | null
          status?: string
        }
        Update: {
          agent_type?: string
          created_at?: string
          email?: string
          firm_name?: string
          full_name?: string
          id?: string
          message?: string | null
          status?: string
        }
        Relationships: []
      }
      ai_reports: {
        Row: {
          ai_run_id: string
          case_id: string
          chunk_output_raw: string | null
          client_report: string | null
          confidence_level: string
          consolidation_attempts: number
          coverage_report: Json | null
          created_at: string
          downstream_status: Json | null
          draft_email: string | null
          finalisation_status: string
          id: string
          internal_report: string | null
          modification_count: number | null
          modified_at: string | null
          modified_by: string | null
          section_compliance: Json
          version: number
        }
        Insert: {
          ai_run_id: string
          case_id: string
          chunk_output_raw?: string | null
          client_report?: string | null
          confidence_level?: string
          consolidation_attempts?: number
          coverage_report?: Json | null
          created_at?: string
          downstream_status?: Json | null
          draft_email?: string | null
          finalisation_status?: string
          id?: string
          internal_report?: string | null
          modification_count?: number | null
          modified_at?: string | null
          modified_by?: string | null
          section_compliance?: Json
          version?: number
        }
        Update: {
          ai_run_id?: string
          case_id?: string
          chunk_output_raw?: string | null
          client_report?: string | null
          confidence_level?: string
          consolidation_attempts?: number
          coverage_report?: Json | null
          created_at?: string
          downstream_status?: Json | null
          draft_email?: string | null
          finalisation_status?: string
          id?: string
          internal_report?: string | null
          modification_count?: number | null
          modified_at?: string | null
          modified_by?: string | null
          section_compliance?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "ai_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      approved_domains: {
        Row: {
          added_by: string | null
          created_at: string
          domain: string
          firm_name: string
          id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          domain: string
          firm_name?: string
          id?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          domain?: string
          firm_name?: string
          id?: string
        }
        Relationships: []
      }
      armalytix_reports: {
        Row: {
          amount_to_prove: number | null
          case_id: string
          created_at: string
          current_residential_status: string | null
          developer_incentives: boolean | null
          excess_shortfall: number | null
          first_time_buyer: boolean | null
          gifts_declared: boolean | null
          id: string
          ingested_at: string | null
          ingested_by: string | null
          mortgage_amount: number | null
          mortgage_lender: string | null
          mortgage_offer_in_place: boolean | null
          mortgage_term: string | null
          mortgage_type: string | null
          parser_version: string | null
          prior_deposit_amount: number | null
          prior_deposit_paid: boolean | null
          raw_json: Json | null
          report_date: string | null
          report_file_name: string | null
          report_file_path: string | null
          stamp_duty_expected: number | null
          status: string
          total_balance_available: number | null
          updated_at: string
        }
        Insert: {
          amount_to_prove?: number | null
          case_id: string
          created_at?: string
          current_residential_status?: string | null
          developer_incentives?: boolean | null
          excess_shortfall?: number | null
          first_time_buyer?: boolean | null
          gifts_declared?: boolean | null
          id?: string
          ingested_at?: string | null
          ingested_by?: string | null
          mortgage_amount?: number | null
          mortgage_lender?: string | null
          mortgage_offer_in_place?: boolean | null
          mortgage_term?: string | null
          mortgage_type?: string | null
          parser_version?: string | null
          prior_deposit_amount?: number | null
          prior_deposit_paid?: boolean | null
          raw_json?: Json | null
          report_date?: string | null
          report_file_name?: string | null
          report_file_path?: string | null
          stamp_duty_expected?: number | null
          status?: string
          total_balance_available?: number | null
          updated_at?: string
        }
        Update: {
          amount_to_prove?: number | null
          case_id?: string
          created_at?: string
          current_residential_status?: string | null
          developer_incentives?: boolean | null
          excess_shortfall?: number | null
          first_time_buyer?: boolean | null
          gifts_declared?: boolean | null
          id?: string
          ingested_at?: string | null
          ingested_by?: string | null
          mortgage_amount?: number | null
          mortgage_lender?: string | null
          mortgage_offer_in_place?: boolean | null
          mortgage_term?: string | null
          mortgage_type?: string | null
          parser_version?: string | null
          prior_deposit_amount?: number | null
          prior_deposit_paid?: boolean | null
          raw_json?: Json | null
          report_date?: string | null
          report_file_name?: string | null
          report_file_path?: string | null
          stamp_duty_expected?: number | null
          status?: string
          total_balance_available?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "armalytix_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "armalytix_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          case_reference: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          user_email: string
          user_id: string | null
          user_name: string
          user_position: string
        }
        Insert: {
          case_reference?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          user_email: string
          user_id?: string | null
          user_name: string
          user_position?: string
        }
        Update: {
          case_reference?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          user_email?: string
          user_id?: string | null
          user_name?: string
          user_position?: string
        }
        Relationships: []
      }
      auto_deploy_settings: {
        Row: {
          agent_type: string
          enabled: boolean
          id: string
          min_precision_improvement: number
          min_recall_improvement: number
          require_zero_regressions: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent_type: string
          enabled?: boolean
          id?: string
          min_precision_improvement?: number
          min_recall_improvement?: number
          require_zero_regressions?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent_type?: string
          enabled?: boolean
          id?: string
          min_precision_improvement?: number
          min_recall_improvement?: number
          require_zero_regressions?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      benchmark_batches: {
        Row: {
          agent_filter: string | null
          completed_at: string | null
          completed_cases: number
          created_at: string
          created_by: string
          failed_cases: number
          id: string
          include_analysis: boolean
          source_filter: string | null
          status: string
          total_cases: number
        }
        Insert: {
          agent_filter?: string | null
          completed_at?: string | null
          completed_cases?: number
          created_at?: string
          created_by: string
          failed_cases?: number
          id?: string
          include_analysis?: boolean
          source_filter?: string | null
          status?: string
          total_cases?: number
        }
        Update: {
          agent_filter?: string | null
          completed_at?: string | null
          completed_cases?: number
          created_at?: string
          created_by?: string
          failed_cases?: number
          id?: string
          include_analysis?: boolean
          source_filter?: string | null
          status?: string
          total_cases?: number
        }
        Relationships: []
      }
      benchmark_cases: {
        Row: {
          agent_type: string
          case_type: string
          confidence_level: string
          created_at: string
          created_by: string
          id: string
          is_excluded: boolean
          notes: string | null
          oversight_at: string | null
          oversight_by: string | null
          oversight_reason: string | null
          oversight_status:
            | Database["public"]["Enums"]["oversight_status"]
            | null
          property_address: string
          source_type: string
          sra_id_number: string | null
          sra_solicitor_name: string | null
          status: string
          title: string
          transaction_type: string
          trigger_context: Json | null
          updated_at: string
        }
        Insert: {
          agent_type?: string
          case_type?: string
          confidence_level?: string
          created_at?: string
          created_by: string
          id?: string
          is_excluded?: boolean
          notes?: string | null
          oversight_at?: string | null
          oversight_by?: string | null
          oversight_reason?: string | null
          oversight_status?:
            | Database["public"]["Enums"]["oversight_status"]
            | null
          property_address?: string
          source_type?: string
          sra_id_number?: string | null
          sra_solicitor_name?: string | null
          status?: string
          title: string
          transaction_type?: string
          trigger_context?: Json | null
          updated_at?: string
        }
        Update: {
          agent_type?: string
          case_type?: string
          confidence_level?: string
          created_at?: string
          created_by?: string
          id?: string
          is_excluded?: boolean
          notes?: string | null
          oversight_at?: string | null
          oversight_by?: string | null
          oversight_reason?: string | null
          oversight_status?:
            | Database["public"]["Enums"]["oversight_status"]
            | null
          property_address?: string
          source_type?: string
          sra_id_number?: string | null
          sra_solicitor_name?: string | null
          status?: string
          title?: string
          transaction_type?: string
          trigger_context?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      benchmark_comparison_items: {
        Row: {
          ai_action: string | null
          ai_finding: string
          ai_severity: string | null
          comparison_id: string
          created_at: string
          difference_type: string
          document_source: string
          evidence_citation: string | null
          evidence_text: string
          human_action: string | null
          human_finding: string
          human_severity: string | null
          id: string
          issue_type: string
          notes: string | null
        }
        Insert: {
          ai_action?: string | null
          ai_finding?: string
          ai_severity?: string | null
          comparison_id: string
          created_at?: string
          difference_type?: string
          document_source?: string
          evidence_citation?: string | null
          evidence_text?: string
          human_action?: string | null
          human_finding?: string
          human_severity?: string | null
          id?: string
          issue_type?: string
          notes?: string | null
        }
        Update: {
          ai_action?: string | null
          ai_finding?: string
          ai_severity?: string | null
          comparison_id?: string
          created_at?: string
          difference_type?: string
          document_source?: string
          evidence_citation?: string | null
          evidence_text?: string
          human_action?: string | null
          human_finding?: string
          human_severity?: string | null
          id?: string
          issue_type?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_comparison_items_comparison_id_fkey"
            columns: ["comparison_id"]
            isOneToOne: false
            referencedRelation: "benchmark_comparisons"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_comparisons: {
        Row: {
          ai_run_id: string | null
          benchmark_case_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          evidence_grounding: number | null
          extraction_accuracy: number | null
          id: string
          is_audited: boolean
          judge_status: string
          judge_summary: Json | null
          precision_score: number | null
          prompt_version: string | null
          reasoning_quality: number | null
          recall_score: number | null
          status: string
          summary_stats: Json | null
        }
        Insert: {
          ai_run_id?: string | null
          benchmark_case_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          evidence_grounding?: number | null
          extraction_accuracy?: number | null
          id?: string
          is_audited?: boolean
          judge_status?: string
          judge_summary?: Json | null
          precision_score?: number | null
          prompt_version?: string | null
          reasoning_quality?: number | null
          recall_score?: number | null
          status?: string
          summary_stats?: Json | null
        }
        Update: {
          ai_run_id?: string | null
          benchmark_case_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          evidence_grounding?: number | null
          extraction_accuracy?: number | null
          id?: string
          is_audited?: boolean
          judge_status?: string
          judge_summary?: Json | null
          precision_score?: number | null
          prompt_version?: string | null
          reasoning_quality?: number | null
          recall_score?: number | null
          status?: string
          summary_stats?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_comparisons_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "benchmark_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_comparisons_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "reviewer_queue_view"
            referencedColumns: ["case_id"]
          },
        ]
      }
      benchmark_documents: {
        Row: {
          benchmark_case_id: string
          created_at: string
          doc_type: string
          extracted_chars: number | null
          extraction_error: string | null
          extraction_method: string | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          last_extracted_at: string | null
          uploaded_by: string
        }
        Insert: {
          benchmark_case_id: string
          created_at?: string
          doc_type?: string
          extracted_chars?: number | null
          extraction_error?: string | null
          extraction_method?: string | null
          file_name: string
          file_path: string
          file_size?: number
          id?: string
          last_extracted_at?: string | null
          uploaded_by: string
        }
        Update: {
          benchmark_case_id?: string
          created_at?: string
          doc_type?: string
          extracted_chars?: number | null
          extraction_error?: string | null
          extraction_method?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          last_extracted_at?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_documents_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "benchmark_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_documents_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "reviewer_queue_view"
            referencedColumns: ["case_id"]
          },
        ]
      }
      benchmark_evaluation_items: {
        Row: {
          caveat_preserved: boolean | null
          contradiction_preserved: boolean | null
          created_at: string
          evaluation_id: string
          evidence_citation: string | null
          explanation_quality_score: number | null
          human_position: string | null
          id: string
          mismatch_type: string | null
          notes: string | null
          proportionality_ok: boolean | null
          risk_class: string
          severity: string | null
          system_position: string | null
        }
        Insert: {
          caveat_preserved?: boolean | null
          contradiction_preserved?: boolean | null
          created_at?: string
          evaluation_id: string
          evidence_citation?: string | null
          explanation_quality_score?: number | null
          human_position?: string | null
          id?: string
          mismatch_type?: string | null
          notes?: string | null
          proportionality_ok?: boolean | null
          risk_class: string
          severity?: string | null
          system_position?: string | null
        }
        Update: {
          caveat_preserved?: boolean | null
          contradiction_preserved?: boolean | null
          created_at?: string
          evaluation_id?: string
          evidence_citation?: string | null
          explanation_quality_score?: number | null
          human_position?: string | null
          id?: string
          mismatch_type?: string | null
          notes?: string | null
          proportionality_ok?: boolean | null
          risk_class?: string
          severity?: string | null
          system_position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_evaluation_items_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "benchmark_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_evaluation_items_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation_with_summary"
            referencedColumns: ["evaluation_id"]
          },
        ]
      }
      benchmark_evaluations: {
        Row: {
          ai_run_id: string | null
          benchmark_case_id: string | null
          case_id: string | null
          created_at: string
          evaluator_id: string | null
          evaluator_notes: string | null
          evidence_grounding_score: number | null
          explanation_quality_score: number | null
          firm_name: string | null
          id: string
          matched_items: number
          mismatched_items: number
          overall_precision: number | null
          overall_recall: number | null
          policy_fingerprint: string | null
          policy_version: number | null
          risk_class_summary: Json | null
          total_items: number
          updated_at: string
        }
        Insert: {
          ai_run_id?: string | null
          benchmark_case_id?: string | null
          case_id?: string | null
          created_at?: string
          evaluator_id?: string | null
          evaluator_notes?: string | null
          evidence_grounding_score?: number | null
          explanation_quality_score?: number | null
          firm_name?: string | null
          id?: string
          matched_items?: number
          mismatched_items?: number
          overall_precision?: number | null
          overall_recall?: number | null
          policy_fingerprint?: string | null
          policy_version?: number | null
          risk_class_summary?: Json | null
          total_items?: number
          updated_at?: string
        }
        Update: {
          ai_run_id?: string | null
          benchmark_case_id?: string | null
          case_id?: string | null
          created_at?: string
          evaluator_id?: string | null
          evaluator_notes?: string | null
          evidence_grounding_score?: number | null
          explanation_quality_score?: number | null
          firm_name?: string | null
          id?: string
          matched_items?: number
          mismatched_items?: number
          overall_precision?: number | null
          overall_recall?: number | null
          policy_fingerprint?: string | null
          policy_version?: number | null
          risk_class_summary?: Json | null
          total_items?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_evaluations_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "benchmark_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_evaluations_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "reviewer_queue_view"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "benchmark_evaluations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "benchmark_evaluations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_failure_patterns: {
        Row: {
          agent_type: string
          description: string
          detected_at: string
          document_type: string
          example_case_ids: string[]
          failure_type: string
          id: string
          improvement_recommendation: string | null
          issue_category: string
          linked_prompt_patch_id: string | null
          occurrence_count: number
          prompt_versions_affected: string[]
          severity_profile: Json
          source_types: string[]
          status: string
          updated_at: string
        }
        Insert: {
          agent_type: string
          description?: string
          detected_at?: string
          document_type?: string
          example_case_ids?: string[]
          failure_type: string
          id?: string
          improvement_recommendation?: string | null
          issue_category?: string
          linked_prompt_patch_id?: string | null
          occurrence_count?: number
          prompt_versions_affected?: string[]
          severity_profile?: Json
          source_types?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          agent_type?: string
          description?: string
          detected_at?: string
          document_type?: string
          example_case_ids?: string[]
          failure_type?: string
          id?: string
          improvement_recommendation?: string | null
          issue_category?: string
          linked_prompt_patch_id?: string | null
          occurrence_count?: number
          prompt_versions_affected?: string[]
          severity_profile?: Json
          source_types?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_failure_patterns_linked_prompt_patch_id_fkey"
            columns: ["linked_prompt_patch_id"]
            isOneToOne: false
            referencedRelation: "prompt_patches"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_job_items: {
        Row: {
          batch_id: string
          benchmark_case_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          started_at: string | null
          status: string
        }
        Insert: {
          batch_id: string
          benchmark_case_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string
        }
        Update: {
          batch_id?: string
          benchmark_case_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_job_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "benchmark_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_job_items_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "benchmark_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_job_items_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "reviewer_queue_view"
            referencedColumns: ["case_id"]
          },
        ]
      }
      benchmark_judge_calibration: {
        Row: {
          audited_by: string
          comparison_id: string
          corrected_precision_score: number | null
          corrected_recall_score: number | null
          created_at: string
          human_notes: string | null
          human_verdict: Database["public"]["Enums"]["judge_calibration_verdict"]
          id: string
        }
        Insert: {
          audited_by: string
          comparison_id: string
          corrected_precision_score?: number | null
          corrected_recall_score?: number | null
          created_at?: string
          human_notes?: string | null
          human_verdict: Database["public"]["Enums"]["judge_calibration_verdict"]
          id?: string
        }
        Update: {
          audited_by?: string
          comparison_id?: string
          corrected_precision_score?: number | null
          corrected_recall_score?: number | null
          created_at?: string
          human_notes?: string | null
          human_verdict?: Database["public"]["Enums"]["judge_calibration_verdict"]
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_judge_calibration_comparison_id_fkey"
            columns: ["comparison_id"]
            isOneToOne: false
            referencedRelation: "benchmark_comparisons"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_judge_reviews: {
        Row: {
          ai_was_correct: boolean | null
          comparison_id: string
          comparison_item_id: string
          confidence_score: number | null
          created_at: string
          evidence_grounded: boolean | null
          ground_truth_stronger: boolean | null
          id: string
          judge_model: string
          judge_reasoning: string
          judge_verdict: string
          partially_acceptable: boolean | null
        }
        Insert: {
          ai_was_correct?: boolean | null
          comparison_id: string
          comparison_item_id: string
          confidence_score?: number | null
          created_at?: string
          evidence_grounded?: boolean | null
          ground_truth_stronger?: boolean | null
          id?: string
          judge_model?: string
          judge_reasoning?: string
          judge_verdict?: string
          partially_acceptable?: boolean | null
        }
        Update: {
          ai_was_correct?: boolean | null
          comparison_id?: string
          comparison_item_id?: string
          confidence_score?: number | null
          created_at?: string
          evidence_grounded?: boolean | null
          ground_truth_stronger?: boolean | null
          id?: string
          judge_model?: string
          judge_reasoning?: string
          judge_verdict?: string
          partially_acceptable?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_judge_reviews_comparison_id_fkey"
            columns: ["comparison_id"]
            isOneToOne: false
            referencedRelation: "benchmark_comparisons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_judge_reviews_comparison_item_id_fkey"
            columns: ["comparison_item_id"]
            isOneToOne: false
            referencedRelation: "benchmark_comparison_items"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_outputs: {
        Row: {
          benchmark_case_id: string
          content: string
          created_at: string
          file_name: string | null
          file_path: string | null
          id: string
          label: string
          output_type: string
          uploaded_by: string
        }
        Insert: {
          benchmark_case_id: string
          content?: string
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          label?: string
          output_type?: string
          uploaded_by: string
        }
        Update: {
          benchmark_case_id?: string
          content?: string
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          label?: string
          output_type?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_outputs_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "benchmark_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_outputs_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "reviewer_queue_view"
            referencedColumns: ["case_id"]
          },
        ]
      }
      benchmark_system_locks: {
        Row: {
          expires_at: string | null
          id: string
          is_locked: boolean
          lock_type: Database["public"]["Enums"]["benchmark_lock_type"]
          locked_at: string | null
          locked_by: string | null
        }
        Insert: {
          expires_at?: string | null
          id?: string
          is_locked?: boolean
          lock_type: Database["public"]["Enums"]["benchmark_lock_type"]
          locked_at?: string | null
          locked_by?: string | null
        }
        Update: {
          expires_at?: string | null
          id?: string
          is_locked?: boolean
          lock_type?: Database["public"]["Enums"]["benchmark_lock_type"]
          locked_at?: string | null
          locked_by?: string | null
        }
        Relationships: []
      }
      calibration_governance_decisions: {
        Row: {
          calibration_signal_id: string
          created_at: string
          disposition: Database["public"]["Enums"]["governance_disposition"]
          follow_up_notes: string | null
          follow_up_required: boolean
          id: string
          policy_change_made: boolean
          policy_change_reference: string | null
          rationale: string | null
          reviewer_id: string | null
          reviewer_name: string | null
        }
        Insert: {
          calibration_signal_id: string
          created_at?: string
          disposition: Database["public"]["Enums"]["governance_disposition"]
          follow_up_notes?: string | null
          follow_up_required?: boolean
          id?: string
          policy_change_made?: boolean
          policy_change_reference?: string | null
          rationale?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
        }
        Update: {
          calibration_signal_id?: string
          created_at?: string
          disposition?: Database["public"]["Enums"]["governance_disposition"]
          follow_up_notes?: string | null
          follow_up_required?: boolean
          id?: string
          policy_change_made?: boolean
          policy_change_reference?: string | null
          rationale?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calibration_governance_decisions_calibration_signal_id_fkey"
            columns: ["calibration_signal_id"]
            isOneToOne: false
            referencedRelation: "calibration_signal_overview"
            referencedColumns: ["signal_id"]
          },
          {
            foreignKeyName: "calibration_governance_decisions_calibration_signal_id_fkey"
            columns: ["calibration_signal_id"]
            isOneToOne: false
            referencedRelation: "calibration_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibration_governance_decisions_calibration_signal_id_fkey"
            columns: ["calibration_signal_id"]
            isOneToOne: false
            referencedRelation: "governance_queue_view"
            referencedColumns: ["signal_id"]
          },
        ]
      }
      calibration_policy_links: {
        Row: {
          applied_at: string
          applied_by: string | null
          calibration_signal_id: string
          change_rationale: string | null
          created_at: string
          firm_policy_id: string | null
          governance_decision_id: string
          id: string
          new_value: string | null
          old_value: string | null
          policy_version_after: number | null
          policy_version_before: number | null
          threshold_changed: string | null
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          calibration_signal_id: string
          change_rationale?: string | null
          created_at?: string
          firm_policy_id?: string | null
          governance_decision_id: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          policy_version_after?: number | null
          policy_version_before?: number | null
          threshold_changed?: string | null
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          calibration_signal_id?: string
          change_rationale?: string | null
          created_at?: string
          firm_policy_id?: string | null
          governance_decision_id?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          policy_version_after?: number | null
          policy_version_before?: number | null
          threshold_changed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calibration_policy_links_calibration_signal_id_fkey"
            columns: ["calibration_signal_id"]
            isOneToOne: false
            referencedRelation: "calibration_signal_overview"
            referencedColumns: ["signal_id"]
          },
          {
            foreignKeyName: "calibration_policy_links_calibration_signal_id_fkey"
            columns: ["calibration_signal_id"]
            isOneToOne: false
            referencedRelation: "calibration_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibration_policy_links_calibration_signal_id_fkey"
            columns: ["calibration_signal_id"]
            isOneToOne: false
            referencedRelation: "governance_queue_view"
            referencedColumns: ["signal_id"]
          },
          {
            foreignKeyName: "calibration_policy_links_governance_decision_id_fkey"
            columns: ["governance_decision_id"]
            isOneToOne: false
            referencedRelation: "calibration_governance_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibration_policy_links_governance_decision_id_fkey"
            columns: ["governance_decision_id"]
            isOneToOne: false
            referencedRelation: "governance_decision_history"
            referencedColumns: ["decision_id"]
          },
        ]
      }
      calibration_signals: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          direction: string
          id: string
          rationale: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_class: string
          signal_strength: number | null
          status: Database["public"]["Enums"]["calibration_signal_status"]
          supporting_disagreement_ids: string[] | null
          supporting_evaluation_ids: string[] | null
          target_policy_area: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          direction: string
          id?: string
          rationale?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_class: string
          signal_strength?: number | null
          status?: Database["public"]["Enums"]["calibration_signal_status"]
          supporting_disagreement_ids?: string[] | null
          supporting_evaluation_ids?: string[] | null
          target_policy_area: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          rationale?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_class?: string
          signal_strength?: number | null
          status?: Database["public"]["Enums"]["calibration_signal_status"]
          supporting_disagreement_ids?: string[] | null
          supporting_evaluation_ids?: string[] | null
          target_policy_area?: string
          updated_at?: string
        }
        Relationships: []
      }
      case_correspondence: {
        Row: {
          attachments: Json | null
          bcc_recipients: Json | null
          case_id: string
          cc_recipients: Json | null
          from_email: string | null
          from_name: string | null
          hoowla_message_id: string
          html_content: string | null
          id: string
          sent_at: string | null
          subject: string
          synced_at: string
          synced_by: string | null
          to_recipients: Json | null
        }
        Insert: {
          attachments?: Json | null
          bcc_recipients?: Json | null
          case_id: string
          cc_recipients?: Json | null
          from_email?: string | null
          from_name?: string | null
          hoowla_message_id: string
          html_content?: string | null
          id?: string
          sent_at?: string | null
          subject?: string
          synced_at?: string
          synced_by?: string | null
          to_recipients?: Json | null
        }
        Update: {
          attachments?: Json | null
          bcc_recipients?: Json | null
          case_id?: string
          cc_recipients?: Json | null
          from_email?: string | null
          from_name?: string | null
          hoowla_message_id?: string
          html_content?: string | null
          id?: string
          sent_at?: string | null
          subject?: string
          synced_at?: string
          synced_by?: string | null
          to_recipients?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "case_correspondence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_correspondence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_notes: {
        Row: {
          case_id: string
          content: string
          created_at: string
          id: string
          parent_id: string | null
          pinned: boolean
          target_id: string | null
          target_type: string | null
          updated_at: string
          user_id: string
          user_name: string
          user_position: string
        }
        Insert: {
          case_id: string
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          pinned?: boolean
          target_id?: string | null
          target_type?: string | null
          updated_at?: string
          user_id: string
          user_name?: string
          user_position?: string
        }
        Update: {
          case_id?: string
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          pinned?: boolean
          target_id?: string | null
          target_type?: string | null
          updated_at?: string
          user_id?: string
          user_name?: string
          user_position?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_notes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "case_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      case_parties: {
        Row: {
          buyer_relationship: string | null
          buyer_type: string | null
          case_id: string
          contact_permission: boolean | null
          contribution_amount: number | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          on_mortgage: boolean | null
          outside_uk: boolean | null
          pep_status: string
          phone: string | null
          raise_enquiry_employment: boolean
          raise_enquiry_funding: boolean
          relationship_to_purchaser: string | null
          role: string
          updated_at: string
        }
        Insert: {
          buyer_relationship?: string | null
          buyer_type?: string | null
          case_id: string
          contact_permission?: boolean | null
          contribution_amount?: number | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          on_mortgage?: boolean | null
          outside_uk?: boolean | null
          pep_status?: string
          phone?: string | null
          raise_enquiry_employment?: boolean
          raise_enquiry_funding?: boolean
          relationship_to_purchaser?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          buyer_relationship?: string | null
          buyer_type?: string | null
          case_id?: string
          contact_permission?: boolean | null
          contribution_amount?: number | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          on_mortgage?: boolean | null
          outside_uk?: boolean | null
          pep_status?: string
          phone?: string | null
          raise_enquiry_employment?: boolean
          raise_enquiry_funding?: boolean
          relationship_to_purchaser?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_parties_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_parties_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          ai_context_notes: Json | null
          amount_to_prove: number | null
          case_flags: string[]
          case_reference: string
          conveyancer_email: string
          conveyancer_id: string
          conveyancer_name: string
          created_at: string
          current_residential_status: string | null
          developer_incentives: boolean | null
          excess_shortfall: number | null
          first_time_buyer: boolean | null
          gifts_involved: boolean | null
          hoowla_last_sync_at: string | null
          hoowla_matter_id: string | null
          id: string
          jurisdiction: string | null
          legal_fees: number | null
          lender: string | null
          mortgage_amount: number | null
          mortgage_offer_explanation: string | null
          mortgage_offer_in_place: boolean | null
          mortgage_required: boolean | null
          ownership_structure_notes: string | null
          prior_deposit_amount: number | null
          prior_deposit_paid: boolean | null
          property_address: string
          property_type: string
          purchase_price: number | null
          risk_level: string | null
          risk_score: number | null
          sdlt_form_additional_property_surcharge: boolean | null
          sdlt_form_first_time_buyer_relief: boolean | null
          sdlt_form_non_uk_resident_surcharge: boolean | null
          sdlt_form_value: number | null
          seller_conveyancer_email: string | null
          stamp_duty: number | null
          status: string
          tenure: string
          total_balance_available: number | null
          transaction_type: string
          updated_at: string
          use_class: string | null
        }
        Insert: {
          ai_context_notes?: Json | null
          amount_to_prove?: number | null
          case_flags?: string[]
          case_reference: string
          conveyancer_email: string
          conveyancer_id: string
          conveyancer_name: string
          created_at?: string
          current_residential_status?: string | null
          developer_incentives?: boolean | null
          excess_shortfall?: number | null
          first_time_buyer?: boolean | null
          gifts_involved?: boolean | null
          hoowla_last_sync_at?: string | null
          hoowla_matter_id?: string | null
          id?: string
          jurisdiction?: string | null
          legal_fees?: number | null
          lender?: string | null
          mortgage_amount?: number | null
          mortgage_offer_explanation?: string | null
          mortgage_offer_in_place?: boolean | null
          mortgage_required?: boolean | null
          ownership_structure_notes?: string | null
          prior_deposit_amount?: number | null
          prior_deposit_paid?: boolean | null
          property_address: string
          property_type: string
          purchase_price?: number | null
          risk_level?: string | null
          risk_score?: number | null
          sdlt_form_additional_property_surcharge?: boolean | null
          sdlt_form_first_time_buyer_relief?: boolean | null
          sdlt_form_non_uk_resident_surcharge?: boolean | null
          sdlt_form_value?: number | null
          seller_conveyancer_email?: string | null
          stamp_duty?: number | null
          status?: string
          tenure: string
          total_balance_available?: number | null
          transaction_type: string
          updated_at?: string
          use_class?: string | null
        }
        Update: {
          ai_context_notes?: Json | null
          amount_to_prove?: number | null
          case_flags?: string[]
          case_reference?: string
          conveyancer_email?: string
          conveyancer_id?: string
          conveyancer_name?: string
          created_at?: string
          current_residential_status?: string | null
          developer_incentives?: boolean | null
          excess_shortfall?: number | null
          first_time_buyer?: boolean | null
          gifts_involved?: boolean | null
          hoowla_last_sync_at?: string | null
          hoowla_matter_id?: string | null
          id?: string
          jurisdiction?: string | null
          legal_fees?: number | null
          lender?: string | null
          mortgage_amount?: number | null
          mortgage_offer_explanation?: string | null
          mortgage_offer_in_place?: boolean | null
          mortgage_required?: boolean | null
          ownership_structure_notes?: string | null
          prior_deposit_amount?: number | null
          prior_deposit_paid?: boolean | null
          property_address?: string
          property_type?: string
          purchase_price?: number | null
          risk_level?: string | null
          risk_score?: number | null
          sdlt_form_additional_property_surcharge?: boolean | null
          sdlt_form_first_time_buyer_relief?: boolean | null
          sdlt_form_non_uk_resident_surcharge?: boolean | null
          sdlt_form_value?: number | null
          seller_conveyancer_email?: string | null
          stamp_duty?: number | null
          status?: string
          tenure?: string
          total_balance_available?: number | null
          transaction_type?: string
          updated_at?: string
          use_class?: string | null
        }
        Relationships: []
      }
      claude_pack_generations: {
        Row: {
          file_count: number
          generated_at: string
          generated_by: string
          id: string
          manifest: Json
          total_bytes: number
        }
        Insert: {
          file_count: number
          generated_at?: string
          generated_by: string
          id?: string
          manifest: Json
          total_bytes: number
        }
        Update: {
          file_count?: number
          generated_at?: string
          generated_by?: string
          id?: string
          manifest?: Json
          total_bytes?: number
        }
        Relationships: []
      }
      clause_pattern_memory: {
        Row: {
          clause_type: string
          created_at: string
          document_type: string | null
          id: string
          last_seen_document_id: string | null
          occurrence_count: number
          pattern_hash: string
          standard_wording_sample: string
          updated_at: string
        }
        Insert: {
          clause_type: string
          created_at?: string
          document_type?: string | null
          id?: string
          last_seen_document_id?: string | null
          occurrence_count?: number
          pattern_hash: string
          standard_wording_sample?: string
          updated_at?: string
        }
        Update: {
          clause_type?: string
          created_at?: string
          document_type?: string | null
          id?: string
          last_seen_document_id?: string | null
          occurrence_count?: number
          pattern_hash?: string
          standard_wording_sample?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clause_pattern_memory_last_seen_document_id_fkey"
            columns: ["last_seen_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_tokens: {
        Row: {
          case_id: string
          client_email: string | null
          client_name: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          is_active: boolean
          last_accessed_at: string | null
          token: string
        }
        Insert: {
          case_id: string
          client_email?: string | null
          client_name: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          is_active?: boolean
          last_accessed_at?: string | null
          token?: string
        }
        Update: {
          case_id?: string
          client_email?: string | null
          client_name?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          last_accessed_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_tokens_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "client_portal_tokens_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_access_requests: {
        Row: {
          created_at: string
          firm_name: string
          id: string
          message: string | null
          provider: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_email: string
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          firm_name: string
          id?: string
          message?: string | null
          provider?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_email: string
          user_id: string
          user_name: string
        }
        Update: {
          created_at?: string
          firm_name?: string
          id?: string
          message?: string | null
          provider?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_email?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      cms_integrations: {
        Row: {
          api_base_url: string
          api_key_encrypted: string
          created_at: string
          created_by: string
          firm_name: string
          id: string
          is_active: boolean
          provider: string
          provider_user_email: string
          updated_at: string
        }
        Insert: {
          api_base_url?: string
          api_key_encrypted?: string
          created_at?: string
          created_by: string
          firm_name?: string
          id?: string
          is_active?: boolean
          provider?: string
          provider_user_email?: string
          updated_at?: string
        }
        Update: {
          api_base_url?: string
          api_key_encrypted?: string
          created_at?: string
          created_by?: string
          firm_name?: string
          id?: string
          is_active?: boolean
          provider?: string
          provider_user_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      confidence_suppressions: {
        Row: {
          correction_signal_ids: string[]
          created_at: string
          document_type: string
          id: string
          is_active: boolean
          ocr_engine: string
          reason: string
          suppression_factor: number
          updated_at: string
        }
        Insert: {
          correction_signal_ids?: string[]
          created_at?: string
          document_type: string
          id?: string
          is_active?: boolean
          ocr_engine?: string
          reason: string
          suppression_factor?: number
          updated_at?: string
        }
        Update: {
          correction_signal_ids?: string[]
          created_at?: string
          document_type?: string
          id?: string
          is_active?: boolean
          ocr_engine?: string
          reason?: string
          suppression_factor?: number
          updated_at?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          balance_after: number
          case_id: string | null
          created_at: string
          description: string
          id: string
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          case_id?: string | null
          created_at?: string
          description?: string
          id?: string
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          case_id?: string | null
          created_at?: string
          description?: string
          id?: string
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_transactions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_integrations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          provider: string
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          provider: string
          updated_at?: string
          webhook_secret?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          provider?: string
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: []
      }
      doc_classification_cache: {
        Row: {
          classifier: string
          created_at: string
          file_hash: string
          id: string
          result: Json
        }
        Insert: {
          classifier: string
          created_at?: string
          file_hash: string
          id?: string
          result: Json
        }
        Update: {
          classifier?: string
          created_at?: string
          file_hash?: string
          id?: string
          result?: Json
        }
        Relationships: []
      }
      doc_processing_cache: {
        Row: {
          bucket: string
          created_at: string
          file_path: string
          file_size: number
          id: string
          is_multimodal: boolean
          mime_type: string | null
          notes: string | null
          text_content: string | null
        }
        Insert: {
          bucket: string
          created_at?: string
          file_path: string
          file_size: number
          id?: string
          is_multimodal?: boolean
          mime_type?: string | null
          notes?: string | null
          text_content?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          file_path?: string
          file_size?: number
          id?: string
          is_multimodal?: boolean
          mime_type?: string | null
          notes?: string | null
          text_content?: string | null
        }
        Relationships: []
      }
      document_checklists: {
        Row: {
          agent_type: string
          created_at: string
          created_by: string | null
          doc_name: string
          doc_slot_id: string
          id: string
          is_active: boolean
          reason: string | null
          required: boolean
          sort_order: number
          tenure: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          agent_type?: string
          created_at?: string
          created_by?: string | null
          doc_name: string
          doc_slot_id: string
          id?: string
          is_active?: boolean
          reason?: string | null
          required?: boolean
          sort_order?: number
          tenure?: string
          transaction_type?: string
          updated_at?: string
        }
        Update: {
          agent_type?: string
          created_at?: string
          created_by?: string | null
          doc_name?: string
          doc_slot_id?: string
          id?: string
          is_active?: boolean
          reason?: string | null
          required?: boolean
          sort_order?: number
          tenure?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_classification_log: {
        Row: {
          acted_at: string | null
          case_id: string
          classification_category: string | null
          classification_confidence: string | null
          classification_description: string | null
          created_at: string
          error_message: string | null
          file_name: string
          file_path: string
          final_folder: string
          id: string
          original_folder: string
          suggested_folder: string | null
          user_action: string | null
          user_id: string | null
          was_auto_moved: boolean | null
        }
        Insert: {
          acted_at?: string | null
          case_id: string
          classification_category?: string | null
          classification_confidence?: string | null
          classification_description?: string | null
          created_at?: string
          error_message?: string | null
          file_name: string
          file_path: string
          final_folder: string
          id?: string
          original_folder: string
          suggested_folder?: string | null
          user_action?: string | null
          user_id?: string | null
          was_auto_moved?: boolean | null
        }
        Update: {
          acted_at?: string | null
          case_id?: string
          classification_category?: string | null
          classification_confidence?: string | null
          classification_description?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_path?: string
          final_folder?: string
          id?: string
          original_folder?: string
          suggested_folder?: string | null
          user_action?: string | null
          user_id?: string | null
          was_auto_moved?: boolean | null
        }
        Relationships: []
      }
      document_correction_signals: {
        Row: {
          bounding_box: Json | null
          case_id: string
          confidence_score: number
          corrected_text: string
          created_at: string
          document_id: string
          document_type: string
          id: string
          ocr_engine: string
          original_text: string
          page_number: number | null
          user_id: string
          user_role: string
        }
        Insert: {
          bounding_box?: Json | null
          case_id: string
          confidence_score?: number
          corrected_text: string
          created_at?: string
          document_id: string
          document_type: string
          id?: string
          ocr_engine?: string
          original_text: string
          page_number?: number | null
          user_id: string
          user_role?: string
        }
        Update: {
          bounding_box?: Json | null
          case_id?: string
          confidence_score?: number
          corrected_text?: string
          created_at?: string
          document_id?: string
          document_type?: string
          id?: string
          ocr_engine?: string
          original_text?: string
          page_number?: number | null
          user_id?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_correction_signals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "document_correction_signals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_correction_signals_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_intelligence: {
        Row: {
          appears_screenshot_or_cropped: boolean
          case_id: string
          classification_confidence: number
          completeness: string
          coverage_date_from: string | null
          coverage_date_to: string | null
          created_at: string
          document_id: string
          document_subtype: string | null
          document_type: string
          extracted_char_count: number
          extraction_confidence: number
          extraction_mode: string
          file_name: string
          file_size_bytes: number
          has_account_ownership_cues: boolean
          has_name_address_fields: boolean
          has_recurring_income_signal: boolean
          has_transaction_table: boolean
          id: string
          mime_type: string | null
          page_count: number | null
          quality: string
          visual_type: string
          warnings: Json
        }
        Insert: {
          appears_screenshot_or_cropped?: boolean
          case_id: string
          classification_confidence?: number
          completeness?: string
          coverage_date_from?: string | null
          coverage_date_to?: string | null
          created_at?: string
          document_id: string
          document_subtype?: string | null
          document_type?: string
          extracted_char_count?: number
          extraction_confidence?: number
          extraction_mode?: string
          file_name: string
          file_size_bytes?: number
          has_account_ownership_cues?: boolean
          has_name_address_fields?: boolean
          has_recurring_income_signal?: boolean
          has_transaction_table?: boolean
          id?: string
          mime_type?: string | null
          page_count?: number | null
          quality?: string
          visual_type?: string
          warnings?: Json
        }
        Update: {
          appears_screenshot_or_cropped?: boolean
          case_id?: string
          classification_confidence?: number
          completeness?: string
          coverage_date_from?: string | null
          coverage_date_to?: string | null
          created_at?: string
          document_id?: string
          document_subtype?: string | null
          document_type?: string
          extracted_char_count?: number
          extraction_confidence?: number
          extraction_mode?: string
          file_name?: string
          file_size_bytes?: number
          has_account_ownership_cues?: boolean
          has_name_address_fields?: boolean
          has_recurring_income_signal?: boolean
          has_transaction_table?: boolean
          id?: string
          mime_type?: string | null
          page_count?: number | null
          quality?: string
          visual_type?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "document_intelligence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "document_intelligence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          case_id: string
          change_summary: string | null
          document_id: string
          file_name: string
          file_path: string
          id: string
          previous_version_id: string | null
          uploaded_at: string
          uploaded_by: string
          version_number: number
        }
        Insert: {
          case_id: string
          change_summary?: string | null
          document_id: string
          file_name: string
          file_path: string
          id?: string
          previous_version_id?: string | null
          uploaded_at?: string
          uploaded_by: string
          version_number?: number
        }
        Update: {
          case_id?: string
          change_summary?: string | null
          document_id?: string
          file_name?: string
          file_path?: string
          id?: string
          previous_version_id?: string | null
          uploaded_at?: string
          uploaded_by?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "document_versions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          appears_complete: boolean
          case_id: string
          completeness_notes: string | null
          created_at: string
          doc_type: string
          file_name: string
          file_path: string
          id: string
          original_file_name: string | null
          proposed_healed_text: string | null
          uploaded_by: string
        }
        Insert: {
          appears_complete?: boolean
          case_id: string
          completeness_notes?: string | null
          created_at?: string
          doc_type: string
          file_name: string
          file_path: string
          id?: string
          original_file_name?: string | null
          proposed_healed_text?: string | null
          uploaded_by: string
        }
        Update: {
          appears_complete?: boolean
          case_id?: string
          completeness_notes?: string | null
          created_at?: string
          doc_type?: string
          file_name?: string
          file_path?: string
          id?: string
          original_file_name?: string | null
          proposed_healed_text?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_review_documents: {
        Row: {
          address_match: string | null
          auto_title: string | null
          created_at: string
          detected_date: string | null
          doc_category: string | null
          doc_group: string
          doc_slot: string | null
          file_name: string
          file_path: string
          id: string
          issuer: string | null
          review_id: string
          uploaded_by: string
        }
        Insert: {
          address_match?: string | null
          auto_title?: string | null
          created_at?: string
          detected_date?: string | null
          doc_category?: string | null
          doc_group?: string
          doc_slot?: string | null
          file_name: string
          file_path: string
          id?: string
          issuer?: string | null
          review_id: string
          uploaded_by: string
        }
        Update: {
          address_match?: string | null
          auto_title?: string | null
          created_at?: string
          detected_date?: string | null
          doc_category?: string | null
          doc_group?: string
          doc_slot?: string | null
          file_name?: string
          file_path?: string
          id?: string
          issuer?: string | null
          review_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_review_documents_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "draft_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_review_results: {
        Row: {
          ai_run_id: string
          created_at: string
          document_inventory: Json
          draft_enquiries: string | null
          flags_summary: Json | null
          hallucination_statement: string | null
          id: string
          internal_report: string | null
          overall_risk_rating: string | null
          review_id: string
          risk_score_summary: Json | null
        }
        Insert: {
          ai_run_id: string
          created_at?: string
          document_inventory?: Json
          draft_enquiries?: string | null
          flags_summary?: Json | null
          hallucination_statement?: string | null
          id?: string
          internal_report?: string | null
          overall_risk_rating?: string | null
          review_id: string
          risk_score_summary?: Json | null
        }
        Update: {
          ai_run_id?: string
          created_at?: string
          document_inventory?: Json
          draft_enquiries?: string | null
          flags_summary?: Json | null
          hallucination_statement?: string | null
          id?: string
          internal_report?: string | null
          overall_risk_rating?: string | null
          review_id?: string
          risk_score_summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "draft_review_results_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "draft_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_reviews: {
        Row: {
          case_id: string | null
          case_reference: string
          created_at: string
          full_name: string
          id: string
          lender_involved: boolean
          property_address: string
          status: string
          tenure: string
          transaction_notes: string | null
          updated_at: string
          user_declaration_accepted_at: string | null
          user_declaration_accepted_by: string | null
          user_email: string
          user_id: string
          user_position: string
        }
        Insert: {
          case_id?: string | null
          case_reference: string
          created_at?: string
          full_name: string
          id?: string
          lender_involved?: boolean
          property_address: string
          status?: string
          tenure?: string
          transaction_notes?: string | null
          updated_at?: string
          user_declaration_accepted_at?: string | null
          user_declaration_accepted_by?: string | null
          user_email: string
          user_id: string
          user_position: string
        }
        Update: {
          case_id?: string | null
          case_reference?: string
          created_at?: string
          full_name?: string
          id?: string
          lender_involved?: boolean
          property_address?: string
          status?: string
          tenure?: string
          transaction_notes?: string | null
          updated_at?: string
          user_declaration_accepted_at?: string | null
          user_declaration_accepted_by?: string | null
          user_email?: string
          user_id?: string
          user_position?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_reviews_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "draft_reviews_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      enhancement_backlog: {
        Row: {
          acceptance_criteria: string
          category: string
          created_at: string
          created_by: string
          feedback_ids: string[]
          id: string
          priority: string
          problem_statement: string
          proposed_change: string
          risk_rationale: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acceptance_criteria: string
          category: string
          created_at?: string
          created_by: string
          feedback_ids?: string[]
          id?: string
          priority: string
          problem_statement: string
          proposed_change: string
          risk_rationale: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acceptance_criteria?: string
          category?: string
          created_at?: string
          created_by?: string
          feedback_ids?: string[]
          id?: string
          priority?: string
          problem_statement?: string
          proposed_change?: string
          risk_rationale?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      enquiry_items: {
        Row: {
          agent_type: string
          case_id: string
          category: string
          created_at: string
          date_last_updated: string
          date_raised: string
          enquiry_number: string
          evidence_received: string | null
          evidence_required: string | null
          id: string
          issue_summary: string
          next_action: string | null
          original_enquiry_text: string
          reply_summary: string | null
          round_id: string
          source: string | null
          source_finding_id: string | null
          source_resolution_id: string | null
          status: string
          who_replied: string | null
        }
        Insert: {
          agent_type: string
          case_id: string
          category: string
          created_at?: string
          date_last_updated?: string
          date_raised?: string
          enquiry_number: string
          evidence_received?: string | null
          evidence_required?: string | null
          id?: string
          issue_summary: string
          next_action?: string | null
          original_enquiry_text: string
          reply_summary?: string | null
          round_id: string
          source?: string | null
          source_finding_id?: string | null
          source_resolution_id?: string | null
          status?: string
          who_replied?: string | null
        }
        Update: {
          agent_type?: string
          case_id?: string
          category?: string
          created_at?: string
          date_last_updated?: string
          date_raised?: string
          enquiry_number?: string
          evidence_received?: string | null
          evidence_required?: string | null
          id?: string
          issue_summary?: string
          next_action?: string | null
          original_enquiry_text?: string
          reply_summary?: string | null
          round_id?: string
          source?: string | null
          source_finding_id?: string | null
          source_resolution_id?: string | null
          status?: string
          who_replied?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "enquiry_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiry_items_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "enquiry_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_overrides: {
        Row: {
          agent_type: string
          case_id: string
          created_at: string
          id: string
          open_enquiry_ids: string[]
          reason: string
          user_email: string
          user_id: string
          user_name: string
        }
        Insert: {
          agent_type: string
          case_id: string
          created_at?: string
          id?: string
          open_enquiry_ids?: string[]
          reason: string
          user_email: string
          user_id: string
          user_name: string
        }
        Update: {
          agent_type?: string
          case_id?: string
          created_at?: string
          id?: string
          open_enquiry_ids?: string[]
          reason?: string
          user_email?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_overrides_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "enquiry_overrides_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_reply_documents: {
        Row: {
          affected_sections: string[] | null
          agent_type: string
          ai_confidence: Json | null
          ai_proposed_enquiry_ids: string[] | null
          auto_note: string | null
          case_id: string
          confirmed_enquiry_ids: string[] | null
          created_at: string
          doc_classification: string | null
          file_name: string
          file_path: string
          id: string
          mapping_source: string | null
          matched_enquiry_ids: string[] | null
          round_number: number
          uploaded_by: string
        }
        Insert: {
          affected_sections?: string[] | null
          agent_type: string
          ai_confidence?: Json | null
          ai_proposed_enquiry_ids?: string[] | null
          auto_note?: string | null
          case_id: string
          confirmed_enquiry_ids?: string[] | null
          created_at?: string
          doc_classification?: string | null
          file_name: string
          file_path: string
          id?: string
          mapping_source?: string | null
          matched_enquiry_ids?: string[] | null
          round_number: number
          uploaded_by: string
        }
        Update: {
          affected_sections?: string[] | null
          agent_type?: string
          ai_confidence?: Json | null
          ai_proposed_enquiry_ids?: string[] | null
          auto_note?: string | null
          case_id?: string
          confirmed_enquiry_ids?: string[] | null
          created_at?: string
          doc_classification?: string | null
          file_name?: string
          file_path?: string
          id?: string
          mapping_source?: string | null
          matched_enquiry_ids?: string[] | null
          round_number?: number
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_reply_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "enquiry_reply_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_rounds: {
        Row: {
          agent_type: string
          ai_run_id: string | null
          case_id: string
          created_at: string
          created_by: string
          draft_email: string | null
          id: string
          internal_report: string | null
          outstanding_summary: string | null
          round_number: number
          status: string
        }
        Insert: {
          agent_type: string
          ai_run_id?: string | null
          case_id: string
          created_at?: string
          created_by: string
          draft_email?: string | null
          id?: string
          internal_report?: string | null
          outstanding_summary?: string | null
          round_number?: number
          status?: string
        }
        Update: {
          agent_type?: string
          ai_run_id?: string | null
          case_id?: string
          created_at?: string
          created_by?: string
          draft_email?: string | null
          id?: string
          internal_report?: string | null
          outstanding_summary?: string | null
          round_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_rounds_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "enquiry_rounds_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_links: {
        Row: {
          ambiguity_notes: string[]
          canonical_name: string
          case_id: string
          confidence: number
          created_at: string
          entity_ids: string[]
          entity_type: string
          human_verified: boolean
          id: string
          link_group_id: string
          match_basis: string
          updated_at: string
        }
        Insert: {
          ambiguity_notes?: string[]
          canonical_name: string
          case_id: string
          confidence?: number
          created_at?: string
          entity_ids?: string[]
          entity_type: string
          human_verified?: boolean
          id?: string
          link_group_id: string
          match_basis?: string
          updated_at?: string
        }
        Update: {
          ambiguity_notes?: string[]
          canonical_name?: string
          case_id?: string
          confidence?: number
          created_at?: string
          entity_ids?: string[]
          entity_type?: string
          human_verified?: boolean
          id?: string
          link_group_id?: string
          match_basis?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_links_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "entity_links_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_references: {
        Row: {
          ai_report_id: string
          anchor_text: string | null
          case_id: string
          confidence_score: number | null
          created_at: string
          document_name: string
          document_path: string
          id: string
          is_primary: boolean
          item_label: string
          item_text: string
          page_number: number | null
          relationship_type: string
          section_heading: string
          sort_order: number
          source_snippet: string
        }
        Insert: {
          ai_report_id: string
          anchor_text?: string | null
          case_id: string
          confidence_score?: number | null
          created_at?: string
          document_name?: string
          document_path?: string
          id?: string
          is_primary?: boolean
          item_label?: string
          item_text?: string
          page_number?: number | null
          relationship_type?: string
          section_heading?: string
          sort_order?: number
          source_snippet?: string
        }
        Update: {
          ai_report_id?: string
          anchor_text?: string | null
          case_id?: string
          confidence_score?: number | null
          created_at?: string
          document_name?: string
          document_path?: string
          id?: string
          is_primary?: boolean
          item_label?: string
          item_text?: string
          page_number?: number | null
          relationship_type?: string
          section_heading?: string
          sort_order?: number
          source_snippet?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_references_ai_report_id_fkey"
            columns: ["ai_report_id"]
            isOneToOne: false
            referencedRelation: "ai_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "evidence_references_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_guard_documents: {
        Row: {
          confidence_pct: number | null
          created_at: string
          detected_type: string | null
          doc_group: string
          file_name: string
          file_path: string
          id: string
          issues: string | null
          manual_override_type: string | null
          review_id: string
          uploaded_by: string
        }
        Insert: {
          confidence_pct?: number | null
          created_at?: string
          detected_type?: string | null
          doc_group?: string
          file_name: string
          file_path: string
          id?: string
          issues?: string | null
          manual_override_type?: string | null
          review_id: string
          uploaded_by: string
        }
        Update: {
          confidence_pct?: number | null
          created_at?: string
          detected_type?: string | null
          doc_group?: string
          file_name?: string
          file_path?: string
          id?: string
          issues?: string | null
          manual_override_type?: string | null
          review_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_guard_documents_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "exchange_guard_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_guard_results: {
        Row: {
          ai_run_id: string
          confidence_rating: string | null
          created_at: string
          cross_document_inconsistencies: Json | null
          document_register: Json
          escalation_flag: boolean | null
          exchange_decision_support: string | null
          exchange_readiness: string | null
          fraud_flags: Json | null
          further_enquiries: string | null
          id: string
          internal_report: string | null
          missing_documents: Json | null
          review_id: string
          risk_rating: string | null
          risk_score: number | null
          risk_summary: Json | null
          transaction_kill_probability: number | null
        }
        Insert: {
          ai_run_id: string
          confidence_rating?: string | null
          created_at?: string
          cross_document_inconsistencies?: Json | null
          document_register?: Json
          escalation_flag?: boolean | null
          exchange_decision_support?: string | null
          exchange_readiness?: string | null
          fraud_flags?: Json | null
          further_enquiries?: string | null
          id?: string
          internal_report?: string | null
          missing_documents?: Json | null
          review_id: string
          risk_rating?: string | null
          risk_score?: number | null
          risk_summary?: Json | null
          transaction_kill_probability?: number | null
        }
        Update: {
          ai_run_id?: string
          confidence_rating?: string | null
          created_at?: string
          cross_document_inconsistencies?: Json | null
          document_register?: Json
          escalation_flag?: boolean | null
          exchange_decision_support?: string | null
          exchange_readiness?: string | null
          fraud_flags?: Json | null
          further_enquiries?: string | null
          id?: string
          internal_report?: string | null
          missing_documents?: Json | null
          review_id?: string
          risk_rating?: string | null
          risk_score?: number | null
          risk_summary?: Json | null
          transaction_kill_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exchange_guard_results_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "exchange_guard_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_guard_reviews: {
        Row: {
          case_id: string | null
          case_reference: string
          created_at: string
          full_name: string
          id: string
          lender: string | null
          property_address: string
          purchase_price: number | null
          status: string
          tenure: string
          transaction_notes: string | null
          transaction_type: string
          updated_at: string
          user_email: string
          user_id: string
          user_position: string
        }
        Insert: {
          case_id?: string | null
          case_reference: string
          created_at?: string
          full_name: string
          id?: string
          lender?: string | null
          property_address: string
          purchase_price?: number | null
          status?: string
          tenure?: string
          transaction_notes?: string | null
          transaction_type?: string
          updated_at?: string
          user_email: string
          user_id: string
          user_position?: string
        }
        Update: {
          case_id?: string | null
          case_reference?: string
          created_at?: string
          full_name?: string
          id?: string
          lender?: string | null
          property_address?: string
          purchase_price?: number | null
          status?: string
          tenure?: string
          transaction_notes?: string | null
          transaction_type?: string
          updated_at?: string
          user_email?: string
          user_id?: string
          user_position?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_guard_reviews_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "exchange_guard_reviews_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      external_profile_checks: {
        Row: {
          ai_run_id: string | null
          case_id: string
          checks: Json
          created_at: string
          declared_occupation: string | null
          enriched_at: string
          has_discrepancy: boolean
          id: string
          no_signal_ratio: number
          overall_outcome: string
          overall_summary: string
          party_id: string
          party_name: string
          requires_review: boolean
        }
        Insert: {
          ai_run_id?: string | null
          case_id: string
          checks?: Json
          created_at?: string
          declared_occupation?: string | null
          enriched_at?: string
          has_discrepancy?: boolean
          id?: string
          no_signal_ratio?: number
          overall_outcome?: string
          overall_summary?: string
          party_id: string
          party_name: string
          requires_review?: boolean
        }
        Update: {
          ai_run_id?: string | null
          case_id?: string
          checks?: Json
          created_at?: string
          declared_occupation?: string | null
          enriched_at?: string
          has_discrepancy?: boolean
          id?: string
          no_signal_ratio?: number
          overall_outcome?: string
          overall_summary?: string
          party_id?: string
          party_name?: string
          requires_review?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "external_profile_checks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "external_profile_checks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      external_profile_signals: {
        Row: {
          created_at: string
          id: string
          is_corroborated: boolean
          is_stale: boolean
          profile_check_id: string
          relevance: string
          requires_review: boolean
          sentiment: string
          should_affect_findings: boolean
          signal_date: string | null
          snippet: string | null
          source_name: string
          source_type: string
          source_url: string | null
          subject_match_confidence: number
          summary: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_corroborated?: boolean
          is_stale?: boolean
          profile_check_id: string
          relevance?: string
          requires_review?: boolean
          sentiment?: string
          should_affect_findings?: boolean
          signal_date?: string | null
          snippet?: string | null
          source_name: string
          source_type: string
          source_url?: string | null
          subject_match_confidence?: number
          summary?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_corroborated?: boolean
          is_stale?: boolean
          profile_check_id?: string
          relevance?: string
          requires_review?: boolean
          sentiment?: string
          should_affect_findings?: boolean
          signal_date?: string | null
          snippet?: string | null
          source_name?: string
          source_type?: string
          source_url?: string | null
          subject_match_confidence?: number
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_profile_signals_profile_check_id_fkey"
            columns: ["profile_check_id"]
            isOneToOne: false
            referencedRelation: "external_profile_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_entities: {
        Row: {
          case_id: string
          confidence: number
          context_role: string | null
          created_at: string
          document_id: string
          entity_type: string
          id: string
          normalised_text: string
          page_number: number | null
          raw_text: string
        }
        Insert: {
          case_id: string
          confidence?: number
          context_role?: string | null
          created_at?: string
          document_id: string
          entity_type: string
          id?: string
          normalised_text: string
          page_number?: number | null
          raw_text: string
        }
        Update: {
          case_id?: string
          confidence?: number
          context_role?: string | null
          created_at?: string
          document_id?: string
          entity_type?: string
          id?: string
          normalised_text?: string
          page_number?: number | null
          raw_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracted_entities_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "extracted_entities_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_failure_logs: {
        Row: {
          case_id: string
          created_at: string
          detected_issue: string
          document_id: string
          failure_type: Database["public"]["Enums"]["extraction_failure_type"]
          id: string
          is_resolved: boolean
          raw_payload: Json | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          detected_issue?: string
          document_id: string
          failure_type: Database["public"]["Enums"]["extraction_failure_type"]
          id?: string
          is_resolved?: boolean
          raw_payload?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          detected_issue?: string
          document_id?: string
          failure_type?: Database["public"]["Enums"]["extraction_failure_type"]
          id?: string
          is_resolved?: boolean
          raw_payload?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extraction_failure_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "extraction_failure_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_failure_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      fatf_lists: {
        Row: {
          black_list: string[]
          created_at: string
          grey_list: string[]
          id: string
          last_refreshed_at: string
          publication_date: string
          refresh_source: string
          source_url: string
        }
        Insert: {
          black_list?: string[]
          created_at?: string
          grey_list?: string[]
          id?: string
          last_refreshed_at?: string
          publication_date: string
          refresh_source?: string
          source_url?: string
        }
        Update: {
          black_list?: string[]
          created_at?: string
          grey_list?: string[]
          id?: string
          last_refreshed_at?: string
          publication_date?: string
          refresh_source?: string
          source_url?: string
        }
        Relationships: []
      }
      feedback_settings: {
        Row: {
          id: string
          log_mode_a: boolean
          require_evidence_mode_b: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          log_mode_a?: boolean
          require_evidence_mode_b?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          log_mode_a?: boolean
          require_evidence_mode_b?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      firm_policies: {
        Row: {
          change_note: string | null
          changed_by: string | null
          config: Json
          created_at: string
          firm_name: string
          id: string
          is_active: boolean
          policy_version: number
          updated_at: string
        }
        Insert: {
          change_note?: string | null
          changed_by?: string | null
          config?: Json
          created_at?: string
          firm_name: string
          id?: string
          is_active?: boolean
          policy_version?: number
          updated_at?: string
        }
        Update: {
          change_note?: string | null
          changed_by?: string | null
          config?: Json
          created_at?: string
          firm_name?: string
          id?: string
          is_active?: boolean
          policy_version?: number
          updated_at?: string
        }
        Relationships: []
      }
      firm_policy_history: {
        Row: {
          change_note: string | null
          change_type: string
          changed_by: string | null
          config_snapshot: Json
          created_at: string
          firm_policy_id: string
          id: string
          policy_version: number
        }
        Insert: {
          change_note?: string | null
          change_type?: string
          changed_by?: string | null
          config_snapshot: Json
          created_at?: string
          firm_policy_id: string
          id?: string
          policy_version: number
        }
        Update: {
          change_note?: string | null
          change_type?: string
          changed_by?: string | null
          config_snapshot?: Json
          created_at?: string
          firm_policy_id?: string
          id?: string
          policy_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "firm_policy_history_firm_policy_id_fkey"
            columns: ["firm_policy_id"]
            isOneToOne: false
            referencedRelation: "firm_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      follow_up_reminders: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          enquiry_item_id: string | null
          id: string
          is_active: boolean
          last_sent_at: string | null
          max_sends: number
          next_reminder_at: string
          reminder_type: string
          send_count: number
          threshold_days: number
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by: string
          enquiry_item_id?: string | null
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          max_sends?: number
          next_reminder_at: string
          reminder_type?: string
          send_count?: number
          threshold_days?: number
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          enquiry_item_id?: string | null
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          max_sends?: number
          next_reminder_at?: string
          reminder_type?: string
          send_count?: number
          threshold_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_reminders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "follow_up_reminders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_reminders_enquiry_item_id_fkey"
            columns: ["enquiry_item_id"]
            isOneToOne: false
            referencedRelation: "enquiry_items"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_tasks: {
        Row: {
          ai_run_id: string
          case_id: string
          created_at: string
          dedup_key: string
          description: string
          duplicate_of: string | null
          id: string
          is_blocking: boolean
          linked_evidence_anchors: string[]
          linked_finding_ids: string[]
          linked_review_id: string | null
          linked_roadmap_item_id: string | null
          origin_detail: string
          origin_reference_id: string | null
          origin_type: Database["public"]["Enums"]["task_origin_type"]
          owner_role: Database["public"]["Enums"]["task_owner_role"]
          priority: Database["public"]["Enums"]["task_priority"]
          resolution_note: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          superseded_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_run_id: string
          case_id: string
          created_at?: string
          dedup_key: string
          description?: string
          duplicate_of?: string | null
          id?: string
          is_blocking?: boolean
          linked_evidence_anchors?: string[]
          linked_finding_ids?: string[]
          linked_review_id?: string | null
          linked_roadmap_item_id?: string | null
          origin_detail?: string
          origin_reference_id?: string | null
          origin_type: Database["public"]["Enums"]["task_origin_type"]
          owner_role?: Database["public"]["Enums"]["task_owner_role"]
          priority?: Database["public"]["Enums"]["task_priority"]
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          superseded_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_run_id?: string
          case_id?: string
          created_at?: string
          dedup_key?: string
          description?: string
          duplicate_of?: string | null
          id?: string
          is_blocking?: boolean
          linked_evidence_anchors?: string[]
          linked_finding_ids?: string[]
          linked_review_id?: string | null
          linked_roadmap_item_id?: string | null
          origin_detail?: string
          origin_reference_id?: string | null
          origin_type?: Database["public"]["Enums"]["task_origin_type"]
          owner_role?: Database["public"]["Enums"]["task_owner_role"]
          priority?: Database["public"]["Enums"]["task_priority"]
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          superseded_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_tasks_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "follow_up_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_tasks_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "follow_up_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_alert_acknowledgements: {
        Row: {
          acknowledged_at: string
          id: string
          notes: string | null
          result_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          id?: string
          notes?: string | null
          result_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          id?: string
          notes?: string | null
          result_id?: string
          user_id?: string
        }
        Relationships: []
      }
      free_trial_requests: {
        Row: {
          created_at: string
          current_tools: string
          email: string
          firm_name: string
          firm_size: string
          full_name: string
          id: string
          monthly_cases: string
          phone: string
          position: string
          referral_source: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          current_tools?: string
          email: string
          firm_name?: string
          firm_size?: string
          full_name: string
          id?: string
          monthly_cases?: string
          phone?: string
          position?: string
          referral_source?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          current_tools?: string
          email?: string
          firm_name?: string
          firm_size?: string
          full_name?: string
          id?: string
          monthly_cases?: string
          phone?: string
          position?: string
          referral_source?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      glossary_analytics: {
        Row: {
          created_at: string
          event_type: string
          id: string
          results_count: number | null
          search_query: string | null
          session_id: string
          term_slug: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          results_count?: number | null
          search_query?: string | null
          session_id: string
          term_slug?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          results_count?: number | null
          search_query?: string | null
          session_id?: string
          term_slug?: string | null
        }
        Relationships: []
      }
      glossary_term_versions: {
        Row: {
          applies: string
          change_summary: string | null
          changed_at: string
          changed_by: string | null
          definition: string
          id: string
          legislation: string | null
          letter: string
          related_term_slugs: string[]
          slug: string
          status: string
          term: string
          term_id: string
          version: number
          why_it_matters: string
        }
        Insert: {
          applies?: string
          change_summary?: string | null
          changed_at?: string
          changed_by?: string | null
          definition?: string
          id?: string
          legislation?: string | null
          letter: string
          related_term_slugs?: string[]
          slug: string
          status: string
          term: string
          term_id: string
          version: number
          why_it_matters?: string
        }
        Update: {
          applies?: string
          change_summary?: string | null
          changed_at?: string
          changed_by?: string | null
          definition?: string
          id?: string
          legislation?: string | null
          letter?: string
          related_term_slugs?: string[]
          slug?: string
          status?: string
          term?: string
          term_id?: string
          version?: number
          why_it_matters?: string
        }
        Relationships: [
          {
            foreignKeyName: "glossary_term_versions_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "glossary_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      glossary_terms: {
        Row: {
          applies: string
          created_at: string
          created_by: string | null
          definition: string
          id: string
          legislation: string | null
          letter: string
          related_term_slugs: string[]
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          status: string
          submitted_for_review_at: string | null
          submitted_for_review_by: string | null
          term: string
          updated_at: string
          version: number
          why_it_matters: string
        }
        Insert: {
          applies?: string
          created_at?: string
          created_by?: string | null
          definition?: string
          id?: string
          legislation?: string | null
          letter: string
          related_term_slugs?: string[]
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          status?: string
          submitted_for_review_at?: string | null
          submitted_for_review_by?: string | null
          term: string
          updated_at?: string
          version?: number
          why_it_matters?: string
        }
        Update: {
          applies?: string
          created_at?: string
          created_by?: string | null
          definition?: string
          id?: string
          legislation?: string | null
          letter?: string
          related_term_slugs?: string[]
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          status?: string
          submitted_for_review_at?: string | null
          submitted_for_review_by?: string | null
          term?: string
          updated_at?: string
          version?: number
          why_it_matters?: string
        }
        Relationships: []
      }
      knowledge_base_content: {
        Row: {
          bucket: string
          char_count: number | null
          chunk_index: number | null
          content_embedding: string | null
          created_at: string
          error_message: string | null
          file_name: string
          file_path: string
          file_type: Database["public"]["Enums"]["ingestion_file_type"]
          id: string
          judge_notes: string | null
          media_duration_seconds: number | null
          metadata: Json | null
          parent_file_path: string | null
          processed_at: string | null
          raw_text: string | null
          status: Database["public"]["Enums"]["ingestion_status"]
          transcription_verified: boolean | null
          updated_at: string
          visual_summary: string | null
        }
        Insert: {
          bucket?: string
          char_count?: number | null
          chunk_index?: number | null
          content_embedding?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_path: string
          file_type?: Database["public"]["Enums"]["ingestion_file_type"]
          id?: string
          judge_notes?: string | null
          media_duration_seconds?: number | null
          metadata?: Json | null
          parent_file_path?: string | null
          processed_at?: string | null
          raw_text?: string | null
          status?: Database["public"]["Enums"]["ingestion_status"]
          transcription_verified?: boolean | null
          updated_at?: string
          visual_summary?: string | null
        }
        Update: {
          bucket?: string
          char_count?: number | null
          chunk_index?: number | null
          content_embedding?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_path?: string
          file_type?: Database["public"]["Enums"]["ingestion_file_type"]
          id?: string
          judge_notes?: string | null
          media_duration_seconds?: number | null
          metadata?: Json | null
          parent_file_path?: string | null
          processed_at?: string | null
          raw_text?: string | null
          status?: Database["public"]["Enums"]["ingestion_status"]
          transcription_verified?: boolean | null
          updated_at?: string
          visual_summary?: string | null
        }
        Relationships: []
      }
      knowledge_bases: {
        Row: {
          agent_ids: string[]
          created_at: string
          description: string
          id: string
          label: string
        }
        Insert: {
          agent_ids?: string[]
          created_at?: string
          description?: string
          id: string
          label: string
        }
        Update: {
          agent_ids?: string[]
          created_at?: string
          description?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          content_tsv: unknown
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          token_count: number
        }
        Insert: {
          chunk_index?: number
          content: string
          content_tsv?: unknown
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          token_count?: number
        }
        Update: {
          chunk_index?: number
          content?: string
          content_tsv?: unknown
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          token_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          agent_id: string
          approved_at: string | null
          approved_by: string | null
          category: string
          chunk_count: number
          content_text: string
          created_at: string
          description: string
          doc_type_tag: string
          fetch_error: string | null
          fetch_method: string | null
          file_name: string
          id: string
          jurisdiction: string
          knowledge_base_ids: string[]
          lender_relevance: boolean
          risk_categories: string[]
          source_url: string | null
          status: string
          suggested_by: string | null
          tenure_types: string[]
          title: string
          transaction_types: string[]
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          agent_id?: string
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          chunk_count?: number
          content_text?: string
          created_at?: string
          description?: string
          doc_type_tag?: string
          fetch_error?: string | null
          fetch_method?: string | null
          file_name?: string
          id?: string
          jurisdiction?: string
          knowledge_base_ids?: string[]
          lender_relevance?: boolean
          risk_categories?: string[]
          source_url?: string | null
          status?: string
          suggested_by?: string | null
          tenure_types?: string[]
          title: string
          transaction_types?: string[]
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          agent_id?: string
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          chunk_count?: number
          content_text?: string
          created_at?: string
          description?: string
          doc_type_tag?: string
          fetch_error?: string | null
          fetch_method?: string | null
          file_name?: string
          id?: string
          jurisdiction?: string
          knowledge_base_ids?: string[]
          lender_relevance?: boolean
          risk_categories?: string[]
          source_url?: string | null
          status?: string
          suggested_by?: string | null
          tenure_types?: string[]
          title?: string
          transaction_types?: string[]
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      lender_handbook_cache: {
        Row: {
          char_count: number
          expires_at: string
          fetched_at: string
          handbook_markdown: string
          handbook_sections: Json
          id: string
          lender_key: string
          lender_name: string
        }
        Insert: {
          char_count?: number
          expires_at?: string
          fetched_at?: string
          handbook_markdown?: string
          handbook_sections?: Json
          id?: string
          lender_key: string
          lender_name: string
        }
        Update: {
          char_count?: number
          expires_at?: string
          fetched_at?: string
          handbook_markdown?: string
          handbook_sections?: Json
          id?: string
          lender_key?: string
          lender_name?: string
        }
        Relationships: []
      }
      lender_rules: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          lender_name: string
          rule_key: string
          rule_type: string
          rule_value: string
          severity: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          lender_name: string
          rule_key: string
          rule_type: string
          rule_value: string
          severity?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          lender_name?: string
          rule_key?: string
          rule_type?: string
          rule_value?: string
          severity?: string
          updated_at?: string
        }
        Relationships: []
      }
      observability_events: {
        Row: {
          ai_run_id: string | null
          case_id: string | null
          created_at: string
          details: Json | null
          event_type: string
          id: string
          linked_review_id: string | null
          severity: Database["public"]["Enums"]["observability_severity"]
          trace_references: Json | null
        }
        Insert: {
          ai_run_id?: string | null
          case_id?: string | null
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          linked_review_id?: string | null
          severity?: Database["public"]["Enums"]["observability_severity"]
          trace_references?: Json | null
        }
        Update: {
          ai_run_id?: string | null
          case_id?: string | null
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          linked_review_id?: string | null
          severity?: Database["public"]["Enums"]["observability_severity"]
          trace_references?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "observability_events_linked_review_id_fkey"
            columns: ["linked_review_id"]
            isOneToOne: false
            referencedRelation: "review_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      ofsi_screening_runs: {
        Row: {
          case_id: string
          created_at: string
          id: string
          ofsi_entries_checked: number
          overall_status: string
          parties_screened: number
          results: Json
          screened_at: string
          screened_by: string | null
          threshold: number
          tier_counts: Json
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          ofsi_entries_checked?: number
          overall_status: string
          parties_screened?: number
          results?: Json
          screened_at?: string
          screened_by?: string | null
          threshold: number
          tier_counts?: Json
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          ofsi_entries_checked?: number
          overall_status?: string
          parties_screened?: number
          results?: Json
          screened_at?: string
          screened_by?: string | null
          threshold?: number
          tier_counts?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ofsi_screening_runs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "ofsi_screening_runs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_run_snapshots: {
        Row: {
          ai_run_id: string
          blocking_issues: Json
          case_id: string
          created_at: string
          findings_summary: Json
          id: string
          readiness_explanation: string
          readiness_state: string
          roadmap: Json
          schema_version: number
          tasks: Json
        }
        Insert: {
          ai_run_id: string
          blocking_issues?: Json
          case_id: string
          created_at?: string
          findings_summary?: Json
          id?: string
          readiness_explanation?: string
          readiness_state: string
          roadmap?: Json
          schema_version?: number
          tasks?: Json
        }
        Update: {
          ai_run_id?: string
          blocking_issues?: Json
          case_id?: string
          created_at?: string
          findings_summary?: Json
          id?: string
          readiness_explanation?: string
          readiness_state?: string
          roadmap?: Json
          schema_version?: number
          tasks?: Json
        }
        Relationships: [
          {
            foreignKeyName: "operational_run_snapshots_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "operational_run_snapshots_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      proactive_notifications: {
        Row: {
          agent_id: string | null
          case_reference: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          notification_type: string
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          case_reference?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          notification_type?: string
          severity?: string
          title: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          case_reference?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          notification_type?: string
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      proactive_triage_rules: {
        Row: {
          agent_id: string
          created_at: string
          dms_integration_id: string | null
          id: string
          label: string
          priority: Database["public"]["Enums"]["triage_priority"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          dms_integration_id?: string | null
          id?: string
          label?: string
          priority?: Database["public"]["Enums"]["triage_priority"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          dms_integration_id?: string | null
          id?: string
          label?: string
          priority?: Database["public"]["Enums"]["triage_priority"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proactive_triage_rules_dms_integration_id_fkey"
            columns: ["dms_integration_id"]
            isOneToOne: false
            referencedRelation: "dms_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_intelligence_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          id: string
          person_name: string
          result: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at?: string
          id?: string
          person_name: string
          result: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          id?: string
          person_name?: string
          result?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          ai_disclaimer_accepted_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          email: string
          failed_login_attempts: number
          firm_name: string
          full_name: string
          id: string
          last_login_at: string | null
          locked_at: string | null
          position: string
          status: Database["public"]["Enums"]["user_status"]
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          ai_disclaimer_accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          email: string
          failed_login_attempts?: number
          firm_name?: string
          full_name: string
          id?: string
          last_login_at?: string | null
          locked_at?: string | null
          position?: string
          status?: Database["public"]["Enums"]["user_status"]
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          ai_disclaimer_accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          email?: string
          failed_login_attempts?: number
          firm_name?: string
          full_name?: string
          id?: string
          last_login_at?: string | null
          locked_at?: string | null
          position?: string
          status?: Database["public"]["Enums"]["user_status"]
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prompt_defaults: {
        Row: {
          agent_id: string
          base_prompt_text: string
          id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          base_prompt_text: string
          id?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          base_prompt_text?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_patches: {
        Row: {
          agent_id: string
          benchmark_case_id: string | null
          change_reason: string
          comparison_id: string | null
          created_at: string
          created_by: string
          failure_example: string
          id: string
          patch_instruction: string
          predicted_impact: string
          prompt_version_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          title: string
        }
        Insert: {
          agent_id: string
          benchmark_case_id?: string | null
          change_reason?: string
          comparison_id?: string | null
          created_at?: string
          created_by: string
          failure_example?: string
          id?: string
          patch_instruction?: string
          predicted_impact?: string
          prompt_version_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title: string
        }
        Update: {
          agent_id?: string
          benchmark_case_id?: string | null
          change_reason?: string
          comparison_id?: string | null
          created_at?: string
          created_by?: string
          failure_example?: string
          id?: string
          patch_instruction?: string
          predicted_impact?: string
          prompt_version_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_patches_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "benchmark_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_patches_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "reviewer_queue_view"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "prompt_patches_comparison_id_fkey"
            columns: ["comparison_id"]
            isOneToOne: false
            referencedRelation: "benchmark_comparisons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_patches_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_versions: {
        Row: {
          agent_id: string
          approved_at: string | null
          approved_by: string | null
          change_reason: string
          created_at: string
          created_by: string
          deployed_at: string | null
          id: string
          patch_ids: string[] | null
          prompt_text: string
          regression_results: Json | null
          status: string
          version: number
        }
        Insert: {
          agent_id: string
          approved_at?: string | null
          approved_by?: string | null
          change_reason?: string
          created_at?: string
          created_by: string
          deployed_at?: string | null
          id?: string
          patch_ids?: string[] | null
          prompt_text?: string
          regression_results?: Json | null
          status?: string
          version?: number
        }
        Update: {
          agent_id?: string
          approved_at?: string | null
          approved_by?: string | null
          change_reason?: string
          created_at?: string
          created_by?: string
          deployed_at?: string | null
          id?: string
          patch_ids?: string[] | null
          prompt_text?: string
          regression_results?: Json | null
          status?: string
          version?: number
        }
        Relationships: []
      }
      qa_results: {
        Row: {
          ai_run_id: string
          case_id: string
          checklist: Json
          created_at: string
          id: string
          pass: boolean
          reviewed_by: string | null
          warn: boolean
        }
        Insert: {
          ai_run_id: string
          case_id: string
          checklist?: Json
          created_at?: string
          id?: string
          pass?: boolean
          reviewed_by?: string | null
          warn?: boolean
        }
        Update: {
          ai_run_id?: string
          case_id?: string
          checklist?: Json
          created_at?: string
          id?: string
          pass?: boolean
          reviewed_by?: string | null
          warn?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "qa_results_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "qa_results_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_entries: {
        Row: {
          created_at: string
          id: string
          limit_key: string
          limit_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          limit_key: string
          limit_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          limit_key?: string
          limit_type?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          credited_at: string | null
          credits_granted: boolean
          id: string
          referee_email: string
          referee_firm_name: string
          referee_full_name: string
          referee_phone: string | null
          referrer_id: string
          status: string
        }
        Insert: {
          created_at?: string
          credited_at?: string | null
          credits_granted?: boolean
          id?: string
          referee_email: string
          referee_firm_name?: string
          referee_full_name: string
          referee_phone?: string | null
          referrer_id: string
          status?: string
        }
        Update: {
          created_at?: string
          credited_at?: string | null
          credits_granted?: boolean
          id?: string
          referee_email?: string
          referee_firm_name?: string
          referee_full_name?: string
          referee_phone?: string | null
          referrer_id?: string
          status?: string
        }
        Relationships: []
      }
      regression_test_results: {
        Row: {
          benchmark_case_id: string
          created_at: string
          id: string
          improvement_detected: boolean
          notes: string | null
          precision_delta: number | null
          prior_comparison_id: string | null
          prior_precision: number | null
          prior_recall: number | null
          proposed_comparison_id: string | null
          proposed_precision: number | null
          proposed_recall: number | null
          recall_delta: number | null
          regression_detected: boolean
          run_id: string
        }
        Insert: {
          benchmark_case_id: string
          created_at?: string
          id?: string
          improvement_detected?: boolean
          notes?: string | null
          precision_delta?: number | null
          prior_comparison_id?: string | null
          prior_precision?: number | null
          prior_recall?: number | null
          proposed_comparison_id?: string | null
          proposed_precision?: number | null
          proposed_recall?: number | null
          recall_delta?: number | null
          regression_detected?: boolean
          run_id: string
        }
        Update: {
          benchmark_case_id?: string
          created_at?: string
          id?: string
          improvement_detected?: boolean
          notes?: string | null
          precision_delta?: number | null
          prior_comparison_id?: string | null
          prior_precision?: number | null
          prior_recall?: number | null
          proposed_comparison_id?: string | null
          proposed_precision?: number | null
          proposed_recall?: number | null
          recall_delta?: number | null
          regression_detected?: boolean
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regression_test_results_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "benchmark_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regression_test_results_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "reviewer_queue_view"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "regression_test_results_prior_comparison_id_fkey"
            columns: ["prior_comparison_id"]
            isOneToOne: false
            referencedRelation: "benchmark_comparisons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regression_test_results_proposed_comparison_id_fkey"
            columns: ["proposed_comparison_id"]
            isOneToOne: false
            referencedRelation: "benchmark_comparisons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regression_test_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "regression_test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      regression_test_runs: {
        Row: {
          agent_type: string
          benchmark_case_ids: string[]
          completed_at: string | null
          completed_cases: number
          created_at: string
          created_by: string
          id: string
          prior_avg_extraction: number | null
          prior_avg_grounding: number | null
          prior_avg_precision: number | null
          prior_avg_reasoning: number | null
          prior_avg_recall: number | null
          prior_prompt_version: string | null
          prompt_patch_id: string | null
          proposed_avg_extraction: number | null
          proposed_avg_grounding: number | null
          proposed_avg_precision: number | null
          proposed_avg_reasoning: number | null
          proposed_avg_recall: number | null
          proposed_prompt_version: string | null
          source_types_included: string[]
          status: string
          summary: Json | null
          total_cases: number
        }
        Insert: {
          agent_type: string
          benchmark_case_ids?: string[]
          completed_at?: string | null
          completed_cases?: number
          created_at?: string
          created_by: string
          id?: string
          prior_avg_extraction?: number | null
          prior_avg_grounding?: number | null
          prior_avg_precision?: number | null
          prior_avg_reasoning?: number | null
          prior_avg_recall?: number | null
          prior_prompt_version?: string | null
          prompt_patch_id?: string | null
          proposed_avg_extraction?: number | null
          proposed_avg_grounding?: number | null
          proposed_avg_precision?: number | null
          proposed_avg_reasoning?: number | null
          proposed_avg_recall?: number | null
          proposed_prompt_version?: string | null
          source_types_included?: string[]
          status?: string
          summary?: Json | null
          total_cases?: number
        }
        Update: {
          agent_type?: string
          benchmark_case_ids?: string[]
          completed_at?: string | null
          completed_cases?: number
          created_at?: string
          created_by?: string
          id?: string
          prior_avg_extraction?: number | null
          prior_avg_grounding?: number | null
          prior_avg_precision?: number | null
          prior_avg_reasoning?: number | null
          prior_avg_recall?: number | null
          prior_prompt_version?: string | null
          prompt_patch_id?: string | null
          proposed_avg_extraction?: number | null
          proposed_avg_grounding?: number | null
          proposed_avg_precision?: number | null
          proposed_avg_reasoning?: number | null
          proposed_avg_recall?: number | null
          proposed_prompt_version?: string | null
          source_types_included?: string[]
          status?: string
          summary?: Json | null
          total_cases?: number
        }
        Relationships: [
          {
            foreignKeyName: "regression_test_runs_prompt_patch_id_fkey"
            columns: ["prompt_patch_id"]
            isOneToOne: false
            referencedRelation: "prompt_patches"
            referencedColumns: ["id"]
          },
        ]
      }
      regulatory_audit_findings: {
        Row: {
          agreement_type: string | null
          bucket: string
          case_id: string | null
          case_reference: string | null
          created_at: string | null
          detected_date: string | null
          disclosure_data: Json | null
          file_name: string
          file_path: string
          filed_at: string | null
          hmlr_filed: boolean | null
          id: string
          match_type: string
          similarity_score: number | null
          snippet: string | null
          sra_id_number: string | null
          sra_solicitor_name: string | null
          updated_at: string | null
        }
        Insert: {
          agreement_type?: string | null
          bucket: string
          case_id?: string | null
          case_reference?: string | null
          created_at?: string | null
          detected_date?: string | null
          disclosure_data?: Json | null
          file_name: string
          file_path: string
          filed_at?: string | null
          hmlr_filed?: boolean | null
          id?: string
          match_type?: string
          similarity_score?: number | null
          snippet?: string | null
          sra_id_number?: string | null
          sra_solicitor_name?: string | null
          updated_at?: string | null
        }
        Update: {
          agreement_type?: string | null
          bucket?: string
          case_id?: string | null
          case_reference?: string | null
          created_at?: string | null
          detected_date?: string | null
          disclosure_data?: Json | null
          file_name?: string
          file_path?: string
          filed_at?: string | null
          hmlr_filed?: boolean | null
          id?: string
          match_type?: string
          similarity_score?: number | null
          snippet?: string | null
          sra_id_number?: string | null
          sra_solicitor_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      retrieval_logs: {
        Row: {
          agent_id: string
          case_id: string | null
          created_at: string
          documents_retrieved: Json
          fallback_used: boolean
          id: string
          knowledge_bases_queried: string[]
          latency_ms: number | null
          metadata: Json | null
          query_text: string
          retrieval_tier: number
          top_similarity: number | null
          total_chunks_scanned: number
          user_id: string | null
        }
        Insert: {
          agent_id: string
          case_id?: string | null
          created_at?: string
          documents_retrieved?: Json
          fallback_used?: boolean
          id?: string
          knowledge_bases_queried?: string[]
          latency_ms?: number | null
          metadata?: Json | null
          query_text?: string
          retrieval_tier?: number
          top_similarity?: number | null
          total_chunks_scanned?: number
          user_id?: string | null
        }
        Update: {
          agent_id?: string
          case_id?: string | null
          created_at?: string
          documents_retrieved?: Json
          fallback_used?: boolean
          id?: string
          knowledge_bases_queried?: string[]
          latency_ms?: number | null
          metadata?: Json | null
          query_text?: string
          retrieval_tier?: number
          top_similarity?: number | null
          total_chunks_scanned?: number
          user_id?: string | null
        }
        Relationships: []
      }
      review_audit_trail: {
        Row: {
          action: string
          created_at: string
          id: string
          new_state: Json | null
          previous_state: Json | null
          rationale: string | null
          review_queue_id: string
          reviewer_email: string | null
          reviewer_id: string | null
          reviewer_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_state?: Json | null
          previous_state?: Json | null
          rationale?: string | null
          review_queue_id: string
          reviewer_email?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_state?: Json | null
          previous_state?: Json | null
          rationale?: string | null
          review_queue_id?: string
          reviewer_email?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_audit_trail_review_queue_id_fkey"
            columns: ["review_queue_id"]
            isOneToOne: false
            referencedRelation: "review_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      review_queue: {
        Row: {
          ai_run_id: string
          case_id: string
          created_at: string
          disposition: Database["public"]["Enums"]["review_disposition"] | null
          disposition_at: string | null
          disposition_rationale: string | null
          follow_up_tasks_created: boolean
          id: string
          is_automation_blocked: boolean
          is_output_usable: boolean
          is_readiness_advanceable: boolean
          linked_traces: Json | null
          original_validation_status: string
          promoted_status: string | null
          review_reasons: string[]
          review_status: Database["public"]["Enums"]["review_status"]
          reviewer_email: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          superseded_by: string | null
          updated_at: string
        }
        Insert: {
          ai_run_id: string
          case_id: string
          created_at?: string
          disposition?: Database["public"]["Enums"]["review_disposition"] | null
          disposition_at?: string | null
          disposition_rationale?: string | null
          follow_up_tasks_created?: boolean
          id?: string
          is_automation_blocked?: boolean
          is_output_usable?: boolean
          is_readiness_advanceable?: boolean
          linked_traces?: Json | null
          original_validation_status: string
          promoted_status?: string | null
          review_reasons?: string[]
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewer_email?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          superseded_by?: string | null
          updated_at?: string
        }
        Update: {
          ai_run_id?: string
          case_id?: string
          created_at?: string
          disposition?: Database["public"]["Enums"]["review_disposition"] | null
          disposition_at?: string | null
          disposition_rationale?: string | null
          follow_up_tasks_created?: boolean
          id?: string
          is_automation_blocked?: boolean
          is_output_usable?: boolean
          is_readiness_advanceable?: boolean
          linked_traces?: Json | null
          original_validation_status?: string
          promoted_status?: string | null
          review_reasons?: string[]
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewer_email?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          superseded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_queue_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "review_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_scores: {
        Row: {
          ai_run_id: string
          case_id: string
          created_at: string
          drainage_water_score: number
          environmental_score: number
          epc_score: number
          id: string
          local_search_score: number
          risk_level: string
          top_drivers: Json
          total_score: number
        }
        Insert: {
          ai_run_id: string
          case_id: string
          created_at?: string
          drainage_water_score?: number
          environmental_score?: number
          epc_score?: number
          id?: string
          local_search_score?: number
          risk_level: string
          top_drivers?: Json
          total_score?: number
        }
        Update: {
          ai_run_id?: string
          case_id?: string
          created_at?: string
          drainage_water_score?: number
          environmental_score?: number
          epc_score?: number
          id?: string
          local_search_score?: number
          risk_level?: string
          top_drivers?: Json
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "risk_scores_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "risk_scores_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_connected_accounts: {
        Row: {
          account_currency: string
          account_holder_name: string | null
          account_type: string | null
          armalytix_report_id: string
          avg_balance: number | null
          avg_incoming_tx_size: number | null
          avg_monthly_paid_in: number | null
          avg_monthly_paid_out: number | null
          avg_monthly_tx_count: number | null
          avg_outgoing_tx_size: number | null
          bank_name: string | null
          case_id: string
          confidence_label: string | null
          confidence_score: number | null
          contradiction_flag: boolean | null
          created_at: string
          current_balance: number | null
          date_range_end: string | null
          date_range_start: string | null
          extracted_from_section: string | null
          extraction_method: string | null
          id: string
          masked_account_number: string | null
          missing_evidence_flag: boolean | null
          party_id: string | null
          provenance_detail: string | null
          reviewer_locked: boolean | null
          sort_code: string | null
          source_origin: string
          updated_at: string
          verification_status: string | null
        }
        Insert: {
          account_currency?: string
          account_holder_name?: string | null
          account_type?: string | null
          armalytix_report_id: string
          avg_balance?: number | null
          avg_incoming_tx_size?: number | null
          avg_monthly_paid_in?: number | null
          avg_monthly_paid_out?: number | null
          avg_monthly_tx_count?: number | null
          avg_outgoing_tx_size?: number | null
          bank_name?: string | null
          case_id: string
          confidence_label?: string | null
          confidence_score?: number | null
          contradiction_flag?: boolean | null
          created_at?: string
          current_balance?: number | null
          date_range_end?: string | null
          date_range_start?: string | null
          extracted_from_section?: string | null
          extraction_method?: string | null
          id?: string
          masked_account_number?: string | null
          missing_evidence_flag?: boolean | null
          party_id?: string | null
          provenance_detail?: string | null
          reviewer_locked?: boolean | null
          sort_code?: string | null
          source_origin?: string
          updated_at?: string
          verification_status?: string | null
        }
        Update: {
          account_currency?: string
          account_holder_name?: string | null
          account_type?: string | null
          armalytix_report_id?: string
          avg_balance?: number | null
          avg_incoming_tx_size?: number | null
          avg_monthly_paid_in?: number | null
          avg_monthly_paid_out?: number | null
          avg_monthly_tx_count?: number | null
          avg_outgoing_tx_size?: number | null
          bank_name?: string | null
          case_id?: string
          confidence_label?: string | null
          confidence_score?: number | null
          contradiction_flag?: boolean | null
          created_at?: string
          current_balance?: number | null
          date_range_end?: string | null
          date_range_start?: string | null
          extracted_from_section?: string | null
          extraction_method?: string | null
          id?: string
          masked_account_number?: string | null
          missing_evidence_flag?: boolean | null
          party_id?: string | null
          provenance_detail?: string | null
          reviewer_locked?: boolean | null
          sort_code?: string | null
          source_origin?: string
          updated_at?: string
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sow_connected_accounts_armalytix_report_id_fkey"
            columns: ["armalytix_report_id"]
            isOneToOne: false
            referencedRelation: "armalytix_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_connected_accounts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "sow_connected_accounts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_connected_accounts_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "case_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_draft_enquiries: {
        Row: {
          armalytix_report_id: string | null
          case_id: string
          created_at: string
          enquiry_text: string | null
          enquiry_type: string
          id: string
          linked_flag_id: string | null
          priority: string
          ref_id: string | null
          ref_table: string | null
          reviewer_edited: boolean
          status: string
          updated_at: string
        }
        Insert: {
          armalytix_report_id?: string | null
          case_id: string
          created_at?: string
          enquiry_text?: string | null
          enquiry_type?: string
          id?: string
          linked_flag_id?: string | null
          priority?: string
          ref_id?: string | null
          ref_table?: string | null
          reviewer_edited?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          armalytix_report_id?: string | null
          case_id?: string
          created_at?: string
          enquiry_text?: string | null
          enquiry_type?: string
          id?: string
          linked_flag_id?: string | null
          priority?: string
          ref_id?: string | null
          ref_table?: string | null
          reviewer_edited?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sow_draft_enquiries_armalytix_report_id_fkey"
            columns: ["armalytix_report_id"]
            isOneToOne: false
            referencedRelation: "armalytix_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_draft_enquiries_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "sow_draft_enquiries_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_draft_enquiries_linked_flag_id_fkey"
            columns: ["linked_flag_id"]
            isOneToOne: false
            referencedRelation: "sow_risk_flags"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_evidence_items: {
        Row: {
          armalytix_report_id: string | null
          case_id: string
          confidence_label: string | null
          confidence_level: string
          confidence_score: number | null
          contradiction_flag: boolean
          created_at: string
          evidence_detail: string | null
          extracted_from_page: string | null
          extracted_from_section: string | null
          extraction_method: string | null
          id: string
          missing_evidence_flag: boolean
          provenance_detail: string | null
          ref_field: string | null
          ref_id: string
          ref_table: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_locked: boolean | null
          source_origin: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          armalytix_report_id?: string | null
          case_id: string
          confidence_label?: string | null
          confidence_level?: string
          confidence_score?: number | null
          contradiction_flag?: boolean
          created_at?: string
          evidence_detail?: string | null
          extracted_from_page?: string | null
          extracted_from_section?: string | null
          extraction_method?: string | null
          id?: string
          missing_evidence_flag?: boolean
          provenance_detail?: string | null
          ref_field?: string | null
          ref_id: string
          ref_table: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_locked?: boolean | null
          source_origin?: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          armalytix_report_id?: string | null
          case_id?: string
          confidence_label?: string | null
          confidence_level?: string
          confidence_score?: number | null
          contradiction_flag?: boolean
          created_at?: string
          evidence_detail?: string | null
          extracted_from_page?: string | null
          extracted_from_section?: string | null
          extraction_method?: string | null
          id?: string
          missing_evidence_flag?: boolean
          provenance_detail?: string | null
          ref_field?: string | null
          ref_id?: string
          ref_table?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_locked?: boolean | null
          source_origin?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sow_evidence_items_armalytix_report_id_fkey"
            columns: ["armalytix_report_id"]
            isOneToOne: false
            referencedRelation: "armalytix_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_evidence_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "sow_evidence_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_field_provenance: {
        Row: {
          armalytix_report_id: string | null
          case_id: string
          confidence_label: string | null
          confidence_score: number | null
          contradiction_flag: boolean | null
          created_at: string | null
          extracted_from_page: string | null
          extracted_from_section: string | null
          extraction_method: string | null
          field_name: string
          field_value: string | null
          id: string
          missing_evidence_flag: boolean | null
          provenance_detail: string | null
          ref_id: string
          ref_table: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_locked: boolean | null
          source_origin: string | null
          updated_at: string | null
          verification_status: string | null
        }
        Insert: {
          armalytix_report_id?: string | null
          case_id: string
          confidence_label?: string | null
          confidence_score?: number | null
          contradiction_flag?: boolean | null
          created_at?: string | null
          extracted_from_page?: string | null
          extracted_from_section?: string | null
          extraction_method?: string | null
          field_name: string
          field_value?: string | null
          id?: string
          missing_evidence_flag?: boolean | null
          provenance_detail?: string | null
          ref_id: string
          ref_table: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_locked?: boolean | null
          source_origin?: string | null
          updated_at?: string | null
          verification_status?: string | null
        }
        Update: {
          armalytix_report_id?: string | null
          case_id?: string
          confidence_label?: string | null
          confidence_score?: number | null
          contradiction_flag?: boolean | null
          created_at?: string | null
          extracted_from_page?: string | null
          extracted_from_section?: string | null
          extraction_method?: string | null
          field_name?: string
          field_value?: string | null
          id?: string
          missing_evidence_flag?: boolean | null
          provenance_detail?: string | null
          ref_id?: string
          ref_table?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_locked?: boolean | null
          source_origin?: string | null
          updated_at?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sow_field_provenance_armalytix_report_id_fkey"
            columns: ["armalytix_report_id"]
            isOneToOne: false
            referencedRelation: "armalytix_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_field_provenance_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "sow_field_provenance_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_fund_sources: {
        Row: {
          ai_notes: string | null
          annual_gross_salary: number | null
          armalytix_report_id: string
          bonuses_declared: boolean | null
          case_id: string
          confidence_label: string | null
          confidence_score: number | null
          contradiction_flag: boolean | null
          created_at: string
          date_received: string | null
          declared_amount: number | null
          declared_description: string | null
          employer_name: string | null
          extracted_from_section: string | null
          extraction_method: string | null
          id: string
          income_explains_savings: boolean | null
          linked_account_ids: string[] | null
          missing_evidence_flag: boolean | null
          outside_uk: boolean | null
          party_id: string | null
          provenance_detail: string | null
          reviewer_locked: boolean | null
          reviewer_notes: string | null
          source_category: string | null
          source_origin: string
          source_sub_category: string | null
          supporting_doc_name: string | null
          supporting_doc_uploaded: boolean | null
          updated_at: string
          verification_status: string
          years_to_accumulate: number | null
        }
        Insert: {
          ai_notes?: string | null
          annual_gross_salary?: number | null
          armalytix_report_id: string
          bonuses_declared?: boolean | null
          case_id: string
          confidence_label?: string | null
          confidence_score?: number | null
          contradiction_flag?: boolean | null
          created_at?: string
          date_received?: string | null
          declared_amount?: number | null
          declared_description?: string | null
          employer_name?: string | null
          extracted_from_section?: string | null
          extraction_method?: string | null
          id?: string
          income_explains_savings?: boolean | null
          linked_account_ids?: string[] | null
          missing_evidence_flag?: boolean | null
          outside_uk?: boolean | null
          party_id?: string | null
          provenance_detail?: string | null
          reviewer_locked?: boolean | null
          reviewer_notes?: string | null
          source_category?: string | null
          source_origin?: string
          source_sub_category?: string | null
          supporting_doc_name?: string | null
          supporting_doc_uploaded?: boolean | null
          updated_at?: string
          verification_status?: string
          years_to_accumulate?: number | null
        }
        Update: {
          ai_notes?: string | null
          annual_gross_salary?: number | null
          armalytix_report_id?: string
          bonuses_declared?: boolean | null
          case_id?: string
          confidence_label?: string | null
          confidence_score?: number | null
          contradiction_flag?: boolean | null
          created_at?: string
          date_received?: string | null
          declared_amount?: number | null
          declared_description?: string | null
          employer_name?: string | null
          extracted_from_section?: string | null
          extraction_method?: string | null
          id?: string
          income_explains_savings?: boolean | null
          linked_account_ids?: string[] | null
          missing_evidence_flag?: boolean | null
          outside_uk?: boolean | null
          party_id?: string | null
          provenance_detail?: string | null
          reviewer_locked?: boolean | null
          reviewer_notes?: string | null
          source_category?: string | null
          source_origin?: string
          source_sub_category?: string | null
          supporting_doc_name?: string | null
          supporting_doc_uploaded?: boolean | null
          updated_at?: string
          verification_status?: string
          years_to_accumulate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sow_fund_sources_armalytix_report_id_fkey"
            columns: ["armalytix_report_id"]
            isOneToOne: false
            referencedRelation: "armalytix_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_fund_sources_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "sow_fund_sources_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_fund_sources_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "case_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_income_verification: {
        Row: {
          armalytix_report_id: string
          avg_salary_credit: number | null
          case_id: string
          confidence_label: string | null
          confidence_score: number | null
          contradiction_flag: boolean | null
          created_at: string
          extracted_from_section: string | null
          extraction_method: string | null
          fund_source_id: string | null
          id: string
          matched_employer_name: string | null
          max_salary_credit: number | null
          min_salary_credit: number | null
          missing_evidence_flag: boolean | null
          net_pay_on_payslip: number | null
          party_id: string | null
          payslip_date: string | null
          payslip_file_name: string | null
          payslip_name_match: boolean | null
          payslip_uploaded: boolean | null
          payslip_within_3_months: boolean | null
          provenance_detail: string | null
          reviewer_locked: boolean | null
          salary_matched_to_bank: boolean | null
          salary_tx_count: number | null
          source_origin: string
          updated_at: string
          variability_pct: number | null
          verification_status: string | null
        }
        Insert: {
          armalytix_report_id: string
          avg_salary_credit?: number | null
          case_id: string
          confidence_label?: string | null
          confidence_score?: number | null
          contradiction_flag?: boolean | null
          created_at?: string
          extracted_from_section?: string | null
          extraction_method?: string | null
          fund_source_id?: string | null
          id?: string
          matched_employer_name?: string | null
          max_salary_credit?: number | null
          min_salary_credit?: number | null
          missing_evidence_flag?: boolean | null
          net_pay_on_payslip?: number | null
          party_id?: string | null
          payslip_date?: string | null
          payslip_file_name?: string | null
          payslip_name_match?: boolean | null
          payslip_uploaded?: boolean | null
          payslip_within_3_months?: boolean | null
          provenance_detail?: string | null
          reviewer_locked?: boolean | null
          salary_matched_to_bank?: boolean | null
          salary_tx_count?: number | null
          source_origin?: string
          updated_at?: string
          variability_pct?: number | null
          verification_status?: string | null
        }
        Update: {
          armalytix_report_id?: string
          avg_salary_credit?: number | null
          case_id?: string
          confidence_label?: string | null
          confidence_score?: number | null
          contradiction_flag?: boolean | null
          created_at?: string
          extracted_from_section?: string | null
          extraction_method?: string | null
          fund_source_id?: string | null
          id?: string
          matched_employer_name?: string | null
          max_salary_credit?: number | null
          min_salary_credit?: number | null
          missing_evidence_flag?: boolean | null
          net_pay_on_payslip?: number | null
          party_id?: string | null
          payslip_date?: string | null
          payslip_file_name?: string | null
          payslip_name_match?: boolean | null
          payslip_uploaded?: boolean | null
          payslip_within_3_months?: boolean | null
          provenance_detail?: string | null
          reviewer_locked?: boolean | null
          salary_matched_to_bank?: boolean | null
          salary_tx_count?: number | null
          source_origin?: string
          updated_at?: string
          variability_pct?: number | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sow_income_verification_armalytix_report_id_fkey"
            columns: ["armalytix_report_id"]
            isOneToOne: false
            referencedRelation: "armalytix_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_income_verification_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "sow_income_verification_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_income_verification_fund_source_id_fkey"
            columns: ["fund_source_id"]
            isOneToOne: false
            referencedRelation: "sow_fund_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_income_verification_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "case_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_manual_balances: {
        Row: {
          amount: number | null
          armalytix_report_id: string
          attachment_name: string | null
          case_id: string
          confidence_label: string | null
          confidence_score: number | null
          contradiction_flag: boolean | null
          counted_toward_proof: boolean
          created_at: string
          currency: string
          description: string | null
          evidence_status: string
          evidence_type: string | null
          extracted_from_section: string | null
          extraction_method: string | null
          id: string
          linked_fund_source_id: string | null
          missing_evidence_flag: boolean | null
          notes: string | null
          party_id: string | null
          provenance_detail: string | null
          reviewer_locked: boolean | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          armalytix_report_id: string
          attachment_name?: string | null
          case_id: string
          confidence_label?: string | null
          confidence_score?: number | null
          contradiction_flag?: boolean | null
          counted_toward_proof?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          evidence_status?: string
          evidence_type?: string | null
          extracted_from_section?: string | null
          extraction_method?: string | null
          id?: string
          linked_fund_source_id?: string | null
          missing_evidence_flag?: boolean | null
          notes?: string | null
          party_id?: string | null
          provenance_detail?: string | null
          reviewer_locked?: boolean | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          armalytix_report_id?: string
          attachment_name?: string | null
          case_id?: string
          confidence_label?: string | null
          confidence_score?: number | null
          contradiction_flag?: boolean | null
          counted_toward_proof?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          evidence_status?: string
          evidence_type?: string | null
          extracted_from_section?: string | null
          extraction_method?: string | null
          id?: string
          linked_fund_source_id?: string | null
          missing_evidence_flag?: boolean | null
          notes?: string | null
          party_id?: string | null
          provenance_detail?: string | null
          reviewer_locked?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sow_manual_balances_armalytix_report_id_fkey"
            columns: ["armalytix_report_id"]
            isOneToOne: false
            referencedRelation: "armalytix_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_manual_balances_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "sow_manual_balances_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_manual_balances_linked_fund_source_id_fkey"
            columns: ["linked_fund_source_id"]
            isOneToOne: false
            referencedRelation: "sow_fund_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_manual_balances_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "case_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_risk_flags: {
        Row: {
          affected_field: string | null
          affected_ref_id: string | null
          affected_ref_table: string | null
          armalytix_report_id: string | null
          auto_generated: boolean
          case_id: string
          contradiction_summary: string | null
          contradiction_type: string | null
          created_at: string
          flag_type: string
          id: string
          rationale: string | null
          ref_id: string | null
          ref_table: string | null
          resolution_notes: string | null
          resolved: boolean
          reviewer_confirmed: boolean
          severity: string
          updated_at: string
        }
        Insert: {
          affected_field?: string | null
          affected_ref_id?: string | null
          affected_ref_table?: string | null
          armalytix_report_id?: string | null
          auto_generated?: boolean
          case_id: string
          contradiction_summary?: string | null
          contradiction_type?: string | null
          created_at?: string
          flag_type: string
          id?: string
          rationale?: string | null
          ref_id?: string | null
          ref_table?: string | null
          resolution_notes?: string | null
          resolved?: boolean
          reviewer_confirmed?: boolean
          severity?: string
          updated_at?: string
        }
        Update: {
          affected_field?: string | null
          affected_ref_id?: string | null
          affected_ref_table?: string | null
          armalytix_report_id?: string | null
          auto_generated?: boolean
          case_id?: string
          contradiction_summary?: string | null
          contradiction_type?: string | null
          created_at?: string
          flag_type?: string
          id?: string
          rationale?: string | null
          ref_id?: string | null
          ref_table?: string | null
          resolution_notes?: string | null
          resolved?: boolean
          reviewer_confirmed?: boolean
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sow_risk_flags_armalytix_report_id_fkey"
            columns: ["armalytix_report_id"]
            isOneToOne: false
            referencedRelation: "armalytix_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_risk_flags_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "sow_risk_flags_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_transactions: {
        Row: {
          account_id: string
          amount: number | null
          armalytix_category: string | null
          armalytix_report_id: string
          case_id: string
          confidence_label: string | null
          confidence_score: number | null
          contradiction_flag: boolean | null
          created_at: string
          description: string | null
          direction: string
          enquiry_reason: string | null
          enquiry_required: boolean | null
          explanation_status: string
          extracted_from_section: string | null
          extraction_method: string | null
          id: string
          is_cash_or_cash_like: boolean | null
          is_gambling_related: boolean | null
          is_inter_account_transfer: boolean | null
          is_investment_related: boolean | null
          is_large: boolean | null
          is_repeating: boolean | null
          likely_explanation: string | null
          linked_fund_source_id: string | null
          linked_party_id: string | null
          missing_evidence_flag: boolean | null
          provenance_detail: string | null
          reviewer_locked: boolean | null
          reviewer_outcome: string | null
          source_origin: string
          tx_date: string | null
          tx_type: string | null
          updated_at: string
          verification_status: string | null
        }
        Insert: {
          account_id: string
          amount?: number | null
          armalytix_category?: string | null
          armalytix_report_id: string
          case_id: string
          confidence_label?: string | null
          confidence_score?: number | null
          contradiction_flag?: boolean | null
          created_at?: string
          description?: string | null
          direction?: string
          enquiry_reason?: string | null
          enquiry_required?: boolean | null
          explanation_status?: string
          extracted_from_section?: string | null
          extraction_method?: string | null
          id?: string
          is_cash_or_cash_like?: boolean | null
          is_gambling_related?: boolean | null
          is_inter_account_transfer?: boolean | null
          is_investment_related?: boolean | null
          is_large?: boolean | null
          is_repeating?: boolean | null
          likely_explanation?: string | null
          linked_fund_source_id?: string | null
          linked_party_id?: string | null
          missing_evidence_flag?: boolean | null
          provenance_detail?: string | null
          reviewer_locked?: boolean | null
          reviewer_outcome?: string | null
          source_origin?: string
          tx_date?: string | null
          tx_type?: string | null
          updated_at?: string
          verification_status?: string | null
        }
        Update: {
          account_id?: string
          amount?: number | null
          armalytix_category?: string | null
          armalytix_report_id?: string
          case_id?: string
          confidence_label?: string | null
          confidence_score?: number | null
          contradiction_flag?: boolean | null
          created_at?: string
          description?: string | null
          direction?: string
          enquiry_reason?: string | null
          enquiry_required?: boolean | null
          explanation_status?: string
          extracted_from_section?: string | null
          extraction_method?: string | null
          id?: string
          is_cash_or_cash_like?: boolean | null
          is_gambling_related?: boolean | null
          is_inter_account_transfer?: boolean | null
          is_investment_related?: boolean | null
          is_large?: boolean | null
          is_repeating?: boolean | null
          likely_explanation?: string | null
          linked_fund_source_id?: string | null
          linked_party_id?: string | null
          missing_evidence_flag?: boolean | null
          provenance_detail?: string | null
          reviewer_locked?: boolean | null
          reviewer_outcome?: string | null
          source_origin?: string
          tx_date?: string | null
          tx_type?: string | null
          updated_at?: string
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sow_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "sow_connected_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_transactions_armalytix_report_id_fkey"
            columns: ["armalytix_report_id"]
            isOneToOne: false
            referencedRelation: "armalytix_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_transactions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "sow_transactions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_transactions_linked_fund_source_id_fkey"
            columns: ["linked_fund_source_id"]
            isOneToOne: false
            referencedRelation: "sow_fund_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_transactions_linked_party_id_fkey"
            columns: ["linked_party_id"]
            isOneToOne: false
            referencedRelation: "case_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_validation_runs: {
        Row: {
          benchmark_adequately_supported: Json | null
          benchmark_expected_blockers: Json | null
          benchmark_expected_enquiries: Json | null
          benchmark_expected_issues: Json | null
          benchmark_notes: string | null
          case_id: string
          case_reference: string
          comparison_result: Json | null
          created_at: string | null
          created_by: string
          data_sources_used: string[] | null
          draft_enquiries: Json | null
          feedback_items: Json | null
          full_pipeline_result: Json | null
          funding_overview: Json | null
          governance_output: Json | null
          id: string
          is_validation_mode: boolean | null
          overall_useful: boolean | null
          pathway: string
          sign_off_support: Json | null
          status: string | null
          supported_items: Json | null
          unresolved_items: Json | null
        }
        Insert: {
          benchmark_adequately_supported?: Json | null
          benchmark_expected_blockers?: Json | null
          benchmark_expected_enquiries?: Json | null
          benchmark_expected_issues?: Json | null
          benchmark_notes?: string | null
          case_id: string
          case_reference: string
          comparison_result?: Json | null
          created_at?: string | null
          created_by: string
          data_sources_used?: string[] | null
          draft_enquiries?: Json | null
          feedback_items?: Json | null
          full_pipeline_result?: Json | null
          funding_overview?: Json | null
          governance_output?: Json | null
          id?: string
          is_validation_mode?: boolean | null
          overall_useful?: boolean | null
          pathway?: string
          sign_off_support?: Json | null
          status?: string | null
          supported_items?: Json | null
          unresolved_items?: Json | null
        }
        Update: {
          benchmark_adequately_supported?: Json | null
          benchmark_expected_blockers?: Json | null
          benchmark_expected_enquiries?: Json | null
          benchmark_expected_issues?: Json | null
          benchmark_notes?: string | null
          case_id?: string
          case_reference?: string
          comparison_result?: Json | null
          created_at?: string | null
          created_by?: string
          data_sources_used?: string[] | null
          draft_enquiries?: Json | null
          feedback_items?: Json | null
          full_pipeline_result?: Json | null
          funding_overview?: Json | null
          governance_output?: Json | null
          id?: string
          is_validation_mode?: boolean | null
          overall_useful?: boolean | null
          pathway?: string
          sign_off_support?: Json | null
          status?: string | null
          supported_items?: Json | null
          unresolved_items?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sow_validation_runs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "sow_validation_runs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      structured_disagreements: {
        Row: {
          affected_object_id: string | null
          affected_object_type: string | null
          ai_run_id: string | null
          case_id: string | null
          created_at: string
          disagreement_type: string
          evaluation_id: string | null
          human_position: string | null
          id: string
          materiality: string | null
          policy_fingerprint_at_time: string | null
          policy_version_at_time: number | null
          reviewer_id: string | null
          reviewer_rationale: string | null
          risk_class: string | null
          should_influence_calibration: boolean
          system_position: string | null
        }
        Insert: {
          affected_object_id?: string | null
          affected_object_type?: string | null
          ai_run_id?: string | null
          case_id?: string | null
          created_at?: string
          disagreement_type: string
          evaluation_id?: string | null
          human_position?: string | null
          id?: string
          materiality?: string | null
          policy_fingerprint_at_time?: string | null
          policy_version_at_time?: number | null
          reviewer_id?: string | null
          reviewer_rationale?: string | null
          risk_class?: string | null
          should_influence_calibration?: boolean
          system_position?: string | null
        }
        Update: {
          affected_object_id?: string | null
          affected_object_type?: string | null
          ai_run_id?: string | null
          case_id?: string | null
          created_at?: string
          disagreement_type?: string
          evaluation_id?: string | null
          human_position?: string | null
          id?: string
          materiality?: string | null
          policy_fingerprint_at_time?: string | null
          policy_version_at_time?: number | null
          reviewer_id?: string | null
          reviewer_rationale?: string | null
          risk_class?: string | null
          should_influence_calibration?: boolean
          system_position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "structured_disagreements_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "structured_disagreements_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "structured_disagreements_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "benchmark_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "structured_disagreements_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation_with_summary"
            referencedColumns: ["evaluation_id"]
          },
        ]
      }
      support_escalations: {
        Row: {
          conversation: Json
          created_at: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          summary: string
          user_email: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          conversation?: Json
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          summary?: string
          user_email?: string
          user_id?: string | null
          user_name?: string
        }
        Update: {
          conversation?: Json
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          summary?: string
          user_email?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: []
      }
      synthetic_generated_cases: {
        Row: {
          benchmark_case_id: string
          created_at: string
          current_step: string
          generation_metadata: Json
          gold_standard: Json
          id: string
          job_id: string
          scenarios_used: string[]
        }
        Insert: {
          benchmark_case_id: string
          created_at?: string
          current_step?: string
          generation_metadata?: Json
          gold_standard?: Json
          id?: string
          job_id: string
          scenarios_used?: string[]
        }
        Update: {
          benchmark_case_id?: string
          created_at?: string
          current_step?: string
          generation_metadata?: Json
          gold_standard?: Json
          id?: string
          job_id?: string
          scenarios_used?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "synthetic_generated_cases_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "benchmark_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "synthetic_generated_cases_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "reviewer_queue_view"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "synthetic_generated_cases_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "synthetic_generation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      synthetic_generation_jobs: {
        Row: {
          completed_at: string | null
          completed_cases: number
          config: Json
          created_at: string
          created_by: string
          error_log: string | null
          failed_cases: number
          id: string
          started_at: string | null
          status: string
          title: string
          total_cases: number
        }
        Insert: {
          completed_at?: string | null
          completed_cases?: number
          config?: Json
          created_at?: string
          created_by: string
          error_log?: string | null
          failed_cases?: number
          id?: string
          started_at?: string | null
          status?: string
          title: string
          total_cases?: number
        }
        Update: {
          completed_at?: string | null
          completed_cases?: number
          config?: Json
          created_at?: string
          created_by?: string
          error_log?: string | null
          failed_cases?: number
          id?: string
          started_at?: string | null
          status?: string
          title?: string
          total_cases?: number
        }
        Relationships: []
      }
      synthetic_scenarios: {
        Row: {
          associated_doc_types: string[]
          category: string
          created_at: string
          description: string
          difficulty: string
          expected_risks: Json
          id: string
          is_active: boolean
          scenario_type: string
        }
        Insert: {
          associated_doc_types?: string[]
          category: string
          created_at?: string
          description?: string
          difficulty?: string
          expected_risks?: Json
          id?: string
          is_active?: boolean
          scenario_type: string
        }
        Update: {
          associated_doc_types?: string[]
          category?: string
          created_at?: string
          description?: string
          difficulty?: string
          expected_risks?: Json
          id?: string
          is_active?: boolean
          scenario_type?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          category: string
          created_at: string
          id: string
          level: string
          message: string
          metadata: Json | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          level?: string
          message: string
          metadata?: Json | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      task_status_history: {
        Row: {
          ai_run_id: string | null
          change_reason: string
          changed_by: string | null
          created_at: string
          id: string
          metadata: Json | null
          new_status: Database["public"]["Enums"]["task_status"]
          previous_status: Database["public"]["Enums"]["task_status"] | null
          task_id: string
        }
        Insert: {
          ai_run_id?: string | null
          change_reason?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status: Database["public"]["Enums"]["task_status"]
          previous_status?: Database["public"]["Enums"]["task_status"] | null
          task_id: string
        }
        Update: {
          ai_run_id?: string | null
          change_reason?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status?: Database["public"]["Enums"]["task_status"]
          previous_status?: Database["public"]["Enums"]["task_status"] | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_status_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "follow_up_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credits: {
        Row: {
          balance: number
          created_at: string
          id: string
          is_free_trial: boolean
          trial_credits_granted: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          is_free_trial?: boolean
          trial_credits_granted?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          is_free_trial?: boolean
          trial_credits_granted?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          cancelled_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_status_history: {
        Row: {
          changed_by: string
          created_at: string
          id: string
          metadata: Json | null
          new_status: Database["public"]["Enums"]["user_status"]
          old_status: Database["public"]["Enums"]["user_status"] | null
          reason: string | null
          user_id: string
        }
        Insert: {
          changed_by: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status: Database["public"]["Enums"]["user_status"]
          old_status?: Database["public"]["Enums"]["user_status"] | null
          reason?: string | null
          user_id: string
        }
        Update: {
          changed_by?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status?: Database["public"]["Enums"]["user_status"]
          old_status?: Database["public"]["Enums"]["user_status"] | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      validation_traces: {
        Row: {
          agent_id: string
          case_id: string | null
          created_at: string
          critical_defects: string[]
          degraded_state: boolean
          final_validation_status: string
          id: string
          judges: Json
          manual_review_required: boolean
          policy_notes: string[]
          remediation_attempted: string
          remediation_detail: string | null
          response_char_length: number
          run_id: string
          user_id: string | null
        }
        Insert: {
          agent_id: string
          case_id?: string | null
          created_at?: string
          critical_defects?: string[]
          degraded_state?: boolean
          final_validation_status?: string
          id?: string
          judges?: Json
          manual_review_required?: boolean
          policy_notes?: string[]
          remediation_attempted?: string
          remediation_detail?: string | null
          response_char_length?: number
          run_id: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string
          case_id?: string | null
          created_at?: string
          critical_defects?: string[]
          degraded_state?: boolean
          final_validation_status?: string
          id?: string
          judges?: Json
          manual_review_required?: boolean
          policy_notes?: string[]
          remediation_attempted?: string
          remediation_detail?: string | null
          response_char_length?: number
          run_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "validation_traces_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "validation_traces_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      calibration_signal_overview: {
        Row: {
          confidence: number | null
          created_at: string | null
          created_by: string | null
          direction: string | null
          disagreement_count: number | null
          evaluation_count: number | null
          latest_decision_at: string | null
          latest_decision_rationale: string | null
          latest_disposition:
            | Database["public"]["Enums"]["governance_disposition"]
            | null
          latest_policy_change_made: boolean | null
          latest_reviewer: string | null
          rationale: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_class: string | null
          signal_id: string | null
          signal_strength: number | null
          status:
            | Database["public"]["Enums"]["calibration_signal_status"]
            | null
          supporting_disagreement_ids: string[] | null
          supporting_evaluation_ids: string[] | null
          target_policy_area: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      case_operational_summary: {
        Row: {
          age_hours: number | null
          amount_to_prove: number | null
          case_flags: string[] | null
          case_id: string | null
          case_reference: string | null
          case_status: string | null
          conveyancer_email: string | null
          conveyancer_name: string | null
          created_at: string | null
          developer_incentives: boolean | null
          excess_shortfall: number | null
          first_time_buyer: boolean | null
          gifts_involved: boolean | null
          latest_confidence: string | null
          latest_report_at: string | null
          latest_report_modified_at: string | null
          latest_report_version: number | null
          latest_run_id: string | null
          lender: string | null
          mortgage_amount: number | null
          mortgage_offer_in_place: boolean | null
          mortgage_required: boolean | null
          prior_deposit_paid: boolean | null
          property_address: string | null
          property_type: string | null
          purchase_price: number | null
          report_modification_count: number | null
          risk_level: string | null
          risk_score: number | null
          tenure: string | null
          total_balance_available: number | null
          transaction_type: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      evaluation_with_summary: {
        Row: {
          ai_run_id: string | null
          benchmark_case_id: string | null
          case_id: string | null
          comparison_item_count: number | null
          created_at: string | null
          evaluation_id: string | null
          evaluator_id: string | null
          evaluator_notes: string | null
          evidence_grounding_score: number | null
          explanation_quality_score: number | null
          firm_name: string | null
          matched_items: number | null
          mismatch_item_count: number | null
          mismatched_items: number | null
          overall_precision: number | null
          overall_recall: number | null
          policy_fingerprint: string | null
          policy_version: number | null
          risk_class_summary: Json | null
          total_items: number | null
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_evaluations_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "benchmark_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_evaluations_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "reviewer_queue_view"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "benchmark_evaluations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case_operational_summary"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "benchmark_evaluations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_decision_history: {
        Row: {
          current_signal_status:
            | Database["public"]["Enums"]["calibration_signal_status"]
            | null
          decision_at: string | null
          decision_id: string | null
          direction: string | null
          disposition:
            | Database["public"]["Enums"]["governance_disposition"]
            | null
          follow_up_notes: string | null
          follow_up_required: boolean | null
          policy_change_made: boolean | null
          policy_change_reference: string | null
          rationale: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          risk_class: string | null
          signal_id: string | null
          target_policy_area: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calibration_governance_decisions_calibration_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "calibration_signal_overview"
            referencedColumns: ["signal_id"]
          },
          {
            foreignKeyName: "calibration_governance_decisions_calibration_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "calibration_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibration_governance_decisions_calibration_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "governance_queue_view"
            referencedColumns: ["signal_id"]
          },
        ]
      }
      governance_queue_view: {
        Row: {
          age_hours: number | null
          confidence: number | null
          created_at: string | null
          direction: string | null
          follow_up_required: boolean | null
          has_policy_link: boolean | null
          latest_decision_at: string | null
          latest_disposition:
            | Database["public"]["Enums"]["governance_disposition"]
            | null
          latest_rationale: string | null
          latest_reviewer: string | null
          lifecycle_status:
            | Database["public"]["Enums"]["calibration_signal_status"]
            | null
          policy_change_made: boolean | null
          related_disagreement_count: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_class: string | null
          signal_id: string | null
          signal_strength: number | null
          target_policy_area: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      policy_change_audit_trail: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          calibration_signal_id: string | null
          change_rationale: string | null
          decision_rationale: string | null
          direction: string | null
          disposition:
            | Database["public"]["Enums"]["governance_disposition"]
            | null
          firm_policy_id: string | null
          governance_decision_id: string | null
          new_value: string | null
          old_value: string | null
          policy_link_id: string | null
          policy_version_after: number | null
          policy_version_before: number | null
          reviewer_name: string | null
          risk_class: string | null
          signal_status:
            | Database["public"]["Enums"]["calibration_signal_status"]
            | null
          target_policy_area: string | null
          threshold_changed: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calibration_policy_links_calibration_signal_id_fkey"
            columns: ["calibration_signal_id"]
            isOneToOne: false
            referencedRelation: "calibration_signal_overview"
            referencedColumns: ["signal_id"]
          },
          {
            foreignKeyName: "calibration_policy_links_calibration_signal_id_fkey"
            columns: ["calibration_signal_id"]
            isOneToOne: false
            referencedRelation: "calibration_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibration_policy_links_calibration_signal_id_fkey"
            columns: ["calibration_signal_id"]
            isOneToOne: false
            referencedRelation: "governance_queue_view"
            referencedColumns: ["signal_id"]
          },
          {
            foreignKeyName: "calibration_policy_links_governance_decision_id_fkey"
            columns: ["governance_decision_id"]
            isOneToOne: false
            referencedRelation: "calibration_governance_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibration_policy_links_governance_decision_id_fkey"
            columns: ["governance_decision_id"]
            isOneToOne: false
            referencedRelation: "governance_decision_history"
            referencedColumns: ["decision_id"]
          },
        ]
      }
      policy_change_traceability: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          calibration_signal_id: string | null
          change_rationale: string | null
          decision_at: string | null
          decision_confirmed_change: boolean | null
          decision_disposition:
            | Database["public"]["Enums"]["governance_disposition"]
            | null
          decision_rationale: string | null
          decision_reviewer: string | null
          firm_policy_id: string | null
          governance_decision_id: string | null
          new_value: string | null
          old_value: string | null
          policy_link_id: string | null
          policy_version_after: number | null
          policy_version_before: number | null
          signal_confidence: number | null
          signal_direction: string | null
          signal_policy_area: string | null
          signal_risk_class: string | null
          signal_status:
            | Database["public"]["Enums"]["calibration_signal_status"]
            | null
          threshold_changed: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calibration_policy_links_calibration_signal_id_fkey"
            columns: ["calibration_signal_id"]
            isOneToOne: false
            referencedRelation: "calibration_signal_overview"
            referencedColumns: ["signal_id"]
          },
          {
            foreignKeyName: "calibration_policy_links_calibration_signal_id_fkey"
            columns: ["calibration_signal_id"]
            isOneToOne: false
            referencedRelation: "calibration_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibration_policy_links_calibration_signal_id_fkey"
            columns: ["calibration_signal_id"]
            isOneToOne: false
            referencedRelation: "governance_queue_view"
            referencedColumns: ["signal_id"]
          },
          {
            foreignKeyName: "calibration_policy_links_governance_decision_id_fkey"
            columns: ["governance_decision_id"]
            isOneToOne: false
            referencedRelation: "calibration_governance_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibration_policy_links_governance_decision_id_fkey"
            columns: ["governance_decision_id"]
            isOneToOne: false
            referencedRelation: "governance_decision_history"
            referencedColumns: ["decision_id"]
          },
        ]
      }
      reviewer_queue_view: {
        Row: {
          age_minutes: number | null
          agent_type: string | null
          case_id: string | null
          case_status: string | null
          case_type: string | null
          confidence_level: string | null
          created_at: string | null
          is_excluded: boolean | null
          latest_judge_status: string | null
          latest_precision: number | null
          latest_recall: number | null
          oversight_at: string | null
          oversight_by: string | null
          oversight_reason: string | null
          oversight_status:
            | Database["public"]["Enums"]["oversight_status"]
            | null
          property_address: string | null
          sla_breached: boolean | null
          source_type: string | null
          sra_id_number: string | null
          sra_solicitor_name: string | null
          title: string | null
          transaction_type: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_rate_limit_entries: { Args: never; Returns: undefined }
      cms_decrypt_api_key: { Args: { p_encrypted: string }; Returns: string }
      cms_encrypt_api_key: { Args: { p_raw_key: string }; Returns: string }
      deduct_credits_atomic: {
        Args: {
          p_amount: number
          p_case_id?: string
          p_description: string
          p_user_id: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_case_document: { Args: { object_name: string }; Returns: boolean }
      search_knowledge_base_semantic: {
        Args: {
          filter_bucket?: string
          filter_case_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          bucket: string
          chunk_index: number
          file_name: string
          file_path: string
          file_type: string
          id: string
          metadata: Json
          raw_text: string
          similarity: number
        }[]
      }
      search_knowledge_chunks: {
        Args: {
          match_agent_id?: string
          match_count?: number
          match_knowledge_base_ids?: string[]
          match_tenure_type?: string
          match_threshold?: number
          query_embedding_text: string
        }
        Returns: {
          chunk_content: string
          chunk_document_id: string
          chunk_id: string
          document_category: string
          document_title: string
          knowledge_base_id: string
          similarity: number
        }[]
      }
      search_knowledge_chunks_keyword: {
        Args: {
          match_agent_id?: string
          match_count?: number
          match_knowledge_base_ids?: string[]
          match_tenure_type?: string
          per_document_cap?: number
          search_query: string
        }
        Returns: {
          chunk_content: string
          chunk_document_id: string
          chunk_id: string
          document_category: string
          document_title: string
          knowledge_base_id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "support_admin" | "auditor" | "super_admin"
      benchmark_lock_type:
        | "evaluation_worker"
        | "manual_regression"
        | "batch_evaluation"
      calibration_signal_status:
        | "open"
        | "under_review"
        | "accepted"
        | "rejected"
        | "deferred"
        | "implemented"
        | "superseded"
        | "closed_no_action"
      extraction_failure_type:
        | "low_confidence"
        | "engine_mismatch"
        | "layout_break"
      governance_disposition:
        | "accepted_for_policy_change"
        | "rejected"
        | "deferred"
        | "needs_more_evidence"
        | "superseded"
        | "duplicate"
      ingestion_file_type:
        | "pdf"
        | "docx"
        | "doc"
        | "txt"
        | "audio"
        | "image"
        | "other"
        | "video"
      ingestion_status: "pending" | "processing" | "completed" | "error"
      judge_calibration_verdict: "agree" | "disagree"
      observability_severity: "info" | "warning" | "error" | "critical"
      oversight_status: "pending_review" | "human_verified" | "overridden"
      review_disposition:
        | "approved_as_is"
        | "approved_with_notes"
        | "requires_regeneration"
        | "requires_further_evidence"
        | "requires_mlro_escalation"
        | "requires_lender_consideration"
        | "rejected_unsafe_to_use"
        | "duplicate_or_superseded"
      review_status:
        | "pending_review"
        | "in_review"
        | "review_completed"
        | "review_superseded"
        | "closed_no_action"
        | "closed_replaced_by_newer_run"
      task_origin_type:
        | "review_disposition"
        | "external_discrepancy"
        | "roadmap_gap"
        | "escalation_flag"
        | "manual"
      task_owner_role:
        | "fee_earner"
        | "compliance_officer"
        | "mlro"
        | "reviewer"
        | "internal_admin"
        | "lender_consideration_owner"
      task_priority: "critical" | "high" | "medium" | "low"
      task_status:
        | "open"
        | "in_progress"
        | "blocked"
        | "resolved"
        | "superseded"
        | "closed_no_action"
        | "cancelled"
        | "duplicate"
      triage_priority: "low" | "med" | "high"
      user_status:
        | "active"
        | "inactive"
        | "suspended"
        | "locked"
        | "pending_invite"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "user", "support_admin", "auditor", "super_admin"],
      benchmark_lock_type: [
        "evaluation_worker",
        "manual_regression",
        "batch_evaluation",
      ],
      calibration_signal_status: [
        "open",
        "under_review",
        "accepted",
        "rejected",
        "deferred",
        "implemented",
        "superseded",
        "closed_no_action",
      ],
      extraction_failure_type: [
        "low_confidence",
        "engine_mismatch",
        "layout_break",
      ],
      governance_disposition: [
        "accepted_for_policy_change",
        "rejected",
        "deferred",
        "needs_more_evidence",
        "superseded",
        "duplicate",
      ],
      ingestion_file_type: [
        "pdf",
        "docx",
        "doc",
        "txt",
        "audio",
        "image",
        "other",
        "video",
      ],
      ingestion_status: ["pending", "processing", "completed", "error"],
      judge_calibration_verdict: ["agree", "disagree"],
      observability_severity: ["info", "warning", "error", "critical"],
      oversight_status: ["pending_review", "human_verified", "overridden"],
      review_disposition: [
        "approved_as_is",
        "approved_with_notes",
        "requires_regeneration",
        "requires_further_evidence",
        "requires_mlro_escalation",
        "requires_lender_consideration",
        "rejected_unsafe_to_use",
        "duplicate_or_superseded",
      ],
      review_status: [
        "pending_review",
        "in_review",
        "review_completed",
        "review_superseded",
        "closed_no_action",
        "closed_replaced_by_newer_run",
      ],
      task_origin_type: [
        "review_disposition",
        "external_discrepancy",
        "roadmap_gap",
        "escalation_flag",
        "manual",
      ],
      task_owner_role: [
        "fee_earner",
        "compliance_officer",
        "mlro",
        "reviewer",
        "internal_admin",
        "lender_consideration_owner",
      ],
      task_priority: ["critical", "high", "medium", "low"],
      task_status: [
        "open",
        "in_progress",
        "blocked",
        "resolved",
        "superseded",
        "closed_no_action",
        "cancelled",
        "duplicate",
      ],
      triage_priority: ["low", "med", "high"],
      user_status: [
        "active",
        "inactive",
        "suspended",
        "locked",
        "pending_invite",
      ],
    },
  },
} as const
