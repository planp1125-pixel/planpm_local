'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';

const initialTypes = [
    { label: 'PM', value: 'PM' },
    { label: 'AMC', value: 'AMC' },
    { label: 'Calibration', value: 'Calibration' },
    { label: 'Validation', value: 'Validation' },
];

export function useMaintenanceTypes() {
    const [dbTypes, setDbTypes] = useState<{ name: string }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { user } = useAuth();

    useEffect(() => {
        const fetchTypes = async () => {
            const { data, error } = await supabase.from('maintenanceTypes').select('name');
            if (error) {
                console.error('Error fetching maintenance types:', error);
            } else {
                setDbTypes(data || []);
            }
            setIsLoading(false);
        };

        fetchTypes();
    }, []);

    const maintenanceTypes = useMemo(() => {
        const allTypes = [...initialTypes];
        if (dbTypes) {
            dbTypes.forEach(dbType => {
                if (!allTypes.some(t => t.value.toLowerCase() === dbType.name.toLowerCase())) {
                    allTypes.push({ label: dbType.name, value: dbType.name });
                }
            });
        }
        return allTypes;
    }, [dbTypes]);

    const addMaintenanceType = async (typeName: string) => {
        if (!typeName) return;

        const typeExists = maintenanceTypes.some(t => t.value.toLowerCase() === typeName.toLowerCase());
        if (typeExists) return;

        const { error } = await supabase.from('maintenanceTypes').insert({ name: typeName, user_id: user?.id });
        if (error) {
            console.error('Error adding maintenance type:', error);
        } else {
            setDbTypes(prev => [...prev, { name: typeName }]);
        }
    };

    return { maintenanceTypes, addMaintenanceType, isLoading };
}

