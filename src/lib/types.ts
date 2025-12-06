

export type InstrumentStatus = 'AMC' | 'PM' | 'Operational' | 'Out of Service';
export type MaintenanceFrequency = 'Weekly' | 'Monthly' | '3 Months' | '6 Months' | '1 Year';
export type InstrumentType = "Lab Balance" | "Scale" | "pH Meter" | "Tap Density Tester" | "UV-Vis Spectrophotometer" | "GC" | "Spectrometer";
export type MaintenanceTaskType = "Calibration" | "Preventative Maintenance" | "Validation" | "AMC";
export type MaintenanceResultType = 'calibration' | 'service' | 'spare_quotation' | 'other';

export type MaintenanceEvent = {
  id: string; // Document ID
  instrumentId: string;
  dueDate: string;
  type: MaintenanceTaskType;
  description: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Overdue';
  notes?: string;
  completedDate?: string;
  completionNotes?: string;
};

export type MaintenanceResult = {
  id: string;
  maintenanceScheduleId: string;
  instrumentId: string;
  completedDate: string;
  resultType: MaintenanceResultType;
  notes?: string;
  documentUrl?: string;
  createdAt: string;
};

// Template Section Types
export type TemplateSectionType = 'tolerance' | 'range' | 'simple';

export type TestRow = {
  id: string;
  label: string;
  reference?: number;  // The expected/nominal value (for tolerance-based)
  min?: number;        // For range-based
  max?: number;        // For range-based
  unit?: string;
  // When filling results:
  measured?: number;   // User-entered actual value
  error?: number;      // Auto-calculated: measured - reference
  passed?: boolean;    // Auto-calculated based on tolerance/range
};

export type TestSection = {
  id: string;
  title: string;
  type: TemplateSectionType;  // What calculation mode
  tolerance?: number;          // For tolerance-based (e.g., ±0.26)
  unit?: string;               // Default unit for the section
  rows: TestRow[];
  documentUrl?: string;        // Uploaded document for this section
};

export type TestTemplate = {
  id: string;
  name: string;
  description?: string;
  structure: TestSection[];
  createdAt: string;
};

// This represents the data structure in Supabase
export type Instrument = {
  id: string; // Document ID
  eqpId: string;
  instrumentType: InstrumentType;
  make: string;     // Manufacturer
  model: string;
  serialNumber: string;
  location: string;
  maintenanceType: string;  // PM, AMC, Calibration, etc.
  scheduleDate: string; // The start date of the first schedule
  frequency: MaintenanceFrequency;
  nextMaintenanceDate: string;
  imageId: string;
  imageUrl?: string; // Optional user-provided image URL
};

