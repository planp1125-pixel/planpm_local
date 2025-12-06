import { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
    // Auth pages (login, signup) don't use the main sidebar layout
    return <>{children}</>;
}
