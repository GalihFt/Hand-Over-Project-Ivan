export interface TimeProfile {
  mode_hour: number | null;
  distribution: Record<string, number>;
  sample_count: number;
  source: string;
}

export interface OptimizationResult {
  DEST_ID: string;
  ORIG_ID: string;
  CABANG: string;
  SIZE_CONT?: string;
  STATUS: string;
  KATEGORI_POOL: string;
  
  JARAK_TRIANGULASI: number;   // Port->Bongkar->Muat->Port
  JARAK_VIA_PORT: number;       // Port->Bongkar->Port->Muat->Port
  JARAK_BONGKAR_MUAT?: number;  // Hanya jarak bongkar ke muat
  SAVING_KM: number;
  
  COST_TRIANGULASI?: number;
  COST_VIA_PORT?: number;
  SAVING_COST?: number;
  
  SCORE_FINAL: number;
  EST_PERJALANAN_JAM: number;
  GAP_WAKTU_ASLI: number;
  
  REKOMENDASI_TINDAKAN: string;
  WAKTU_BONGKAR_ASLI: string;
  WAKTU_MUAT_ASLI: string;
  DURASI_BONGKAR_EST?: number;
  DURASI_MUAT_EST?: number;
  SELESAI_BONGKAR?: string;
  OPSI_SISI_ORIGIN?: string | null;
  OPSI_SISI_DEST?: string | null;
  
  DEST_CUST_ID?: string;
  ORIG_CUST_ID?: string;
  DEST_TIME_PROFILE?: TimeProfile;
  ORIG_TIME_PROFILE?: TimeProfile;

  origin_coords?: [number, number];
  dest_coords?: [number, number];
  port_coords?: [number, number];
  geometry?: string;
}

export interface CabangStats {
  cabang: string;
  total_origin: number;
  total_dest: number;
  match: number;
  saving: number;
  saving_cost: number;
}

export interface OptimizationStats {
  match: number;
  saving: number;
  savingCost: number;
  total_origin?: number;
  total_dest?: number;
  cabang_breakdown?: CabangStats[];
}

export type ViewState = 'landing' | 'upload' | 'simulation-upload' | 'download' | 'list' | 'detail';

export type AppMode = 'mapping' | 'simulation' | 'planning';

export interface PlanningRow {
  'NO SOPT': string;
  'NO CONTAINER': string;
  'SIZE CONT': string;
  'GRADE CONT': string;
  'CABANG': string;
  'OPS DELIVERY TIME': string;
  'VESVOY': string;
  'BONGKAR FXD': string;
  'CUST ID': string;
  'ALAMAT': string;
  'LONGITUDE': string;
  'LATITUDE': string;
  'SERVICE TYPE': string;
  [key: string]: string | undefined;
}

// --- Validation Types ---

export interface ValidationValueWarning {
  column: string;
  value: string;
  message: string;
}

export interface ValidationRowResult {
  index: number;
  datetime_parsed: string | null;
  datetime_error: string | null;
  geocode_lat: number | null;
  geocode_lon: number | null;
  geocode_error: string | null;
  value_warnings: ValidationValueWarning[];
}

export interface ValidationColumnIssue {
  original: string;
  suggestion: string;
  type: 'missing' | 'renamed';
}

export interface ValidationSummary {
  total_rows: number;
  geocode_success: number;
  geocode_failed: number;
  datetime_success: number;
  datetime_failed: number;
  value_warnings: number;
  missing_required: number;
}

export interface DataValidationResult {
  column_issues: ValidationColumnIssue[];
  rows: ValidationRowResult[];
  summary: ValidationSummary;
}

export interface FullValidationResult {
  dest: DataValidationResult;
  orig: DataValidationResult;
}
