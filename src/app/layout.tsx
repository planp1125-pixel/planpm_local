import type { Metadata } from 'next';
import './globals.css';
import { MainLayout } from '@/components/layout/main-layout';
import { Toaster } from "@/components/ui/toaster";
import { SupabaseProvider } from '@/components/SupabaseProvider';
import { AppContent } from '@/components/layout/app-content';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/contexts/auth-context';

export const metadata: Metadata = {
  title: 'Plan-PM',
  description: 'A maintenance tracker for laboratory instruments.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <SupabaseProvider>
            <AuthProvider>
              <AppContent>
                <MainLayout>
                  {children}
                </MainLayout>
              </AppContent>
            </AuthProvider>
          </SupabaseProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

