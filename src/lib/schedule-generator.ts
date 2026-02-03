import { supabase } from '@/lib/supabase';

type MaintenanceFrequency = 'Daily' | 'Weekly' | 'Monthly' | '3 Months' | '6 Months' | '1 Year';

/**
 * Calculate the next date based on frequency
 */
export function getNextScheduleDate(date: Date, frequency: string): Date {
    const nextDate = new Date(date);
    switch (frequency) {
        case 'Daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        case 'Weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
        case 'Monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
        case '3 Months':
        case 'Quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
        case '6 Months':
        case 'Semi-Annual':
            nextDate.setMonth(nextDate.getMonth() + 6);
            break;
        case '1 Year':
        case 'Annual':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
        default:
            nextDate.setMonth(nextDate.getMonth() + 1);
    }
    return nextDate;
}

/**
 * Get the number of occurrences for a frequency within 1 year
 */
function getOccurrencesPerYear(frequency: string): number {
    switch (frequency) {
        case 'Daily': return 365;
        case 'Weekly': return 52;
        case 'Monthly': return 12;
        case '3 Months':
        case 'Quarterly': return 4;
        case '6 Months':
        case 'Semi-Annual': return 2;
        case '1 Year':
        case 'Annual': return 1;
        default: return 12;
    }
}

/**
 * Generate 1 year of maintenance schedules for a configuration
 */
export async function generateYearSchedules(config: {
    id: string;
    instrument_id: string;
    maintenance_type: string;
    frequency: string;
    schedule_date: string;
    template_id?: string | null;
    user_id?: string;
    org_id?: string | null;
    maintenanceBy?: string;
    vendorName?: string | null;
    vendorContact?: string | null;
}): Promise<{ success: boolean; count: number; error?: string }> {
    // First check if schedules already exist for this instrument and type
    const { data: existingSchedules, error: checkError } = await supabase
        .from('maintenanceSchedules')
        .select('id, dueDate')
        .eq('instrumentId', config.instrument_id)
        .eq('type', config.maintenance_type)
        .neq('status', 'Completed');

    if (checkError) {
        console.error('Error checking existing schedules:', checkError);
    }

    // Create a set of existing due dates to avoid duplicates
    const existingDueDates = new Set(
        (existingSchedules || []).map(s => new Date(s.dueDate).toDateString())
    );

    const occurrences = getOccurrencesPerYear(config.frequency);
    const schedules: any[] = [];
    let currentDate = new Date(config.schedule_date);

    // For local deployment, generate schedules for 1 full year from the schedule_date
    // (not from now), to ensure we always get the expected number of occurrences
    const endDate = new Date(config.schedule_date);
    endDate.setFullYear(endDate.getFullYear() + 1);

    let generated = 0;
    let iterations = 0;
    const maxIterations = occurrences * 2; // Safety limit

    while (generated < occurrences && iterations < maxIterations) {
        iterations++;

        // Skip if this due date already exists
        if (existingDueDates.has(currentDate.toDateString())) {
            currentDate = getNextScheduleDate(currentDate, config.frequency);
            // Don't increment 'generated' - we still need to create this many new schedules
            continue;
        }

        // Check if we're past the 1-year window - if so, stop generating
        if (currentDate > endDate) {
            break;
        }

        const isLast = generated === occurrences - 1;

        schedules.push({
            instrumentId: config.instrument_id,
            dueDate: currentDate.toISOString(),
            type: config.maintenance_type,
            description: `Scheduled ${config.maintenance_type}`,
            status: 'Scheduled',
            template_id: config.template_id || null,
            user_id: config.user_id,
            org_id: config.org_id || null,
            maintenanceBy: config.maintenanceBy || 'internal',
            vendorName: config.vendorName || null,
            vendorContact: config.vendorContact || null,
            is_last_of_year: isLast,
        });

        generated++;
        currentDate = getNextScheduleDate(currentDate, config.frequency);
    }

    if (schedules.length === 0) {
        return { success: true, count: 0 };
    }

    const { error } = await supabase.from('maintenanceSchedules').insert(schedules);

    if (error) {
        console.error('Error generating schedules:', error);
        return { success: false, count: 0, error: error.message };
    }

    return { success: true, count: schedules.length };
}
/**
 * Regenerate schedules when configuration changes.
 * Deletes all pending (non-completed) schedules and creates new ones based on new frequency.
 */
export async function regenerateSchedules(config: {
    instrument_id: string;
    maintenance_type: string;
    frequency: string;
    schedule_date: string;
    template_id?: string | null;
    user_id?: string;
    org_id?: string | null;
    maintenanceBy?: string;
    vendorName?: string | null;
    vendorContact?: string | null;
}): Promise<{ success: boolean; deleted: number; created: number; error?: string }> {
    // Step 1: Delete all pending (non-completed) schedules for this instrument and type
    const { data: deletedSchedules, error: deleteError } = await supabase
        .from('maintenanceSchedules')
        .delete()
        .eq('instrumentId', config.instrument_id)
        .eq('type', config.maintenance_type)
        .neq('status', 'Completed')
        .select('id');

    if (deleteError) {
        console.error('Error deleting pending schedules:', deleteError);
        return { success: false, deleted: 0, created: 0, error: deleteError.message };
    }

    const deletedCount = deletedSchedules?.length || 0;
    console.log(`Deleted ${deletedCount} pending schedules for regeneration`);

    // Step 2: Generate new schedules with the new frequency
    const result = await generateYearSchedules({
        id: '', // Not used
        instrument_id: config.instrument_id,
        maintenance_type: config.maintenance_type,
        frequency: config.frequency,
        schedule_date: config.schedule_date,
        template_id: config.template_id,
        user_id: config.user_id,
        org_id: config.org_id,
        maintenanceBy: config.maintenanceBy,
        vendorName: config.vendorName,
        vendorContact: config.vendorContact,
    });

    if (!result.success) {
        return { success: false, deleted: deletedCount, created: 0, error: result.error };
    }

    return { success: true, deleted: deletedCount, created: result.count };
}

/**
 * Update due dates for all pending schedules when frequency changes
 * @deprecated Use regenerateSchedules instead for proper schedule count handling
 */
export async function updateSchedulesOnFrequencyChange(
    instrumentId: string,
    maintenanceType: string,
    newFrequency: string,
    baseDate: Date
): Promise<{ success: boolean; updated: number; error?: string }> {
    // Get all pending schedules for this instrument and type
    const { data: pendingSchedules, error: fetchError } = await supabase
        .from('maintenanceSchedules')
        .select('id, dueDate')
        .eq('instrumentId', instrumentId)
        .eq('type', maintenanceType)
        .neq('status', 'Completed')
        .order('dueDate', { ascending: true });

    if (fetchError) {
        return { success: false, updated: 0, error: fetchError.message };
    }

    if (!pendingSchedules || pendingSchedules.length === 0) {
        return { success: true, updated: 0 };
    }

    // Recalculate due dates from the base date
    let currentDate = new Date(baseDate);
    const updates: { id: string; dueDate: string; is_last_of_year: boolean }[] = [];

    for (let i = 0; i < pendingSchedules.length; i++) {
        if (i > 0) {
            currentDate = getNextScheduleDate(currentDate, newFrequency);
        }
        updates.push({
            id: pendingSchedules[i].id,
            dueDate: currentDate.toISOString(),
            is_last_of_year: i === pendingSchedules.length - 1,
        });
    }

    // Update each schedule
    let updatedCount = 0;
    for (const update of updates) {
        const { error: updateError } = await supabase
            .from('maintenanceSchedules')
            .update({ dueDate: update.dueDate, is_last_of_year: update.is_last_of_year })
            .eq('id', update.id);

        if (!updateError) updatedCount++;
    }

    return { success: true, updated: updatedCount };
}

/**
 * Auto-generate next year's schedules when the last schedule is completed
 */
export async function checkAndRegenerateSchedules(
    scheduleId: string
): Promise<{ regenerated: boolean; count: number }> {
    // Get the completed schedule
    const { data: completedSchedule, error } = await supabase
        .from('maintenanceSchedules')
        .select('*, instrumentId, type, template_id, maintenanceBy, vendorName, vendorContact, is_last_of_year')
        .eq('id', scheduleId)
        .single();

    if (error || !completedSchedule) {
        return { regenerated: false, count: 0 };
    }

    // Only regenerate if this was the last schedule of the year
    if (!completedSchedule.is_last_of_year) {
        return { regenerated: false, count: 0 };
    }

    // Get the configuration to know the frequency
    const { data: config } = await supabase
        .from('maintenance_configurations')
        .select('frequency')
        .eq('instrument_id', completedSchedule.instrumentId)
        .eq('maintenance_type', completedSchedule.type)
        .single();

    if (!config) {
        return { regenerated: false, count: 0 };
    }

    // Generate next year's schedules starting from the completed date
    const result = await generateYearSchedules({
        id: '', // Not used for generation
        instrument_id: completedSchedule.instrumentId,
        maintenance_type: completedSchedule.type,
        frequency: config.frequency as MaintenanceFrequency,
        schedule_date: getNextScheduleDate(new Date(completedSchedule.completedDate || completedSchedule.dueDate), config.frequency as MaintenanceFrequency).toISOString(),
        template_id: completedSchedule.template_id,
        user_id: completedSchedule.user_id,
        maintenanceBy: completedSchedule.maintenanceBy,
        vendorName: completedSchedule.vendorName,
        vendorContact: completedSchedule.vendorContact,
    });

    return { regenerated: result.success, count: result.count };
}
