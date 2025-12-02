'use client';

import { useCollection, useFirestore, addDocumentNonBlocking, useMemoFirebase } from "@/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import { useMemo } from "react";

const initialTypes = [
  { label: 'Lab Balance', value: 'Lab Balance' },
  { label: 'Scale', value: 'Scale' },
  { label: 'pH Meter', value: 'pH Meter' },
  { label: 'Tap Density Tester', value: 'Tap Density Tester' },
  { label: 'UV-Vis Spectrophotometer', value: 'UV-Vis Spectrophotometer' },
  { label: 'GC', value: 'GC' },
  { label: 'Spectrometer', value: 'Spectrometer' }
];

export function useInstrumentTypes() {
    const firestore = useFirestore();

    const instrumentTypesQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return collection(firestore, 'instrumentTypes');
    }, [firestore]);

    const { data: dbTypes, isLoading } = useCollection<{name: string}>(instrumentTypesQuery);

    const instrumentTypes = useMemo(() => {
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

    const addInstrumentType = (typeName: string) => {
        if (!firestore || !typeName) return;
        
        const typeExists = instrumentTypes.some(t => t.value.toLowerCase() === typeName.toLowerCase());
        if (typeExists) return;

        const newTypeRef = collection(firestore, 'instrumentTypes');
        addDocumentNonBlocking(newTypeRef, { name: typeName });
    };

    return { instrumentTypes, addInstrumentType, isLoading };
}
