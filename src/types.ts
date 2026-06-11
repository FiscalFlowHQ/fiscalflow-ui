export interface ErrorListItem {
  id: string;
  sheet_name: string;
  cell_address: string;
  full_address: string;
  error_category: string;
  fix_status: string;
  explanation: string;
  root_cause_cell?: string | null;
  downstream_impact?: string[];
}

export interface ErrorEntry extends Omit<ErrorListItem, "explanation"> {
  severity?: string;
  formula?: string;
  cached_value?: string | null;
  dependency_chain?: string[];
  suggested_fix?: string;
  suggestion_confidence?: number;
  auto_fix_applied?: string;
  explanation?: string;
  context?: {
    row_label?: string;
    col_header?: string;
  };
}

export interface ErrorsResponse {
  errors: ErrorListItem[];
  total: number;
  page: number;
  per_page: number;
  sheets_with_errors: string[];
}

export interface SheetCell {
  col: string;
  row: number;
  coord: string;
  value: string;
  is_target: boolean;
  is_error: boolean;
}

export interface SheetData {
  headers: string[];
  rows: { _row: number; _cells: SheetCell[] }[];
  min_row: number;
  max_row: number;
  formula: string;
  sheet_name: string;
  center_cell: string;
  error?: string;
}

export interface Progress {
  total: number;
  resolved: number;
  skipped: number;
  remaining: number;
  history_count: number;
}

export interface AuditCreateResponse {
  audit_id: string;
  status: string;
  file_path?: string;
  total_errors?: number;
  needs_review_count?: number;
}
