
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://krsecnzwutwoduaflqii.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtyc2Vjbnp3dXR3b2R1YWZscWlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2Nzc2ODksImV4cCI6MjA4MDI1MzY4OX0.XSnmAPKansJwVIOkB_c0lbVnRZg0MzsmDlVvEcHWFhU';

export const supabase = createClient(supabaseUrl, supabaseKey);
