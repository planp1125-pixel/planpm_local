'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, Lock, Eye, EyeOff, Shield, Users } from 'lucide-react';
import Image from 'next/image';
import planpmLogo from '../../../../icons/planpm.png';
import { useToast } from '@/hooks/use-toast';

import { Separator } from '@/components/ui/separator';

// Check if running against cloud Supabase
const isCloudDeployment = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('supabase.co');

export default function LoginPage() {
    const { signInWithEmail, signInWithGoogle, isLoading: authLoading, session } = useAuth();
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [isLookingUpRole, setIsLookingUpRole] = useState(false);
    const { toast } = useToast();

    // Redirect if already logged in
    useEffect(() => {
        if (!authLoading && session) {
            router.push('/');
        }
    }, [authLoading, session, router]);

    // Lookup user role when username changes
    useEffect(() => {
        const lookupRole = async () => {
            if (!username.trim()) {
                setUserRole(null);
                return;
            }
            setIsLookingUpRole(true);
            try {
                const res = await fetch(`/api/user-role?username=${encodeURIComponent(username.trim())}`);
                const data = await res.json();
                if (data.found) {
                    setUserRole(data.role);
                } else {
                    setUserRole(null);
                }
            } catch {
                setUserRole(null);
            } finally {
                setIsLookingUpRole(false);
            }
        };

        const debounce = setTimeout(lookupRole, 500);
        return () => clearTimeout(debounce);
    }, [username]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !password) {
            toast({
                title: 'Error',
                description: 'Please enter both username and password',
                variant: 'destructive',
            });
            return;
        }

        setIsLoading(true);
        // Convert username to internal email format
        const email = username.includes('@')
            ? username
            : `${username.toLowerCase().replace(/\s+/g, '_')}@planpm.local`;

        const { error } = await signInWithEmail(email, password);
        if (error) {
            toast({
                title: 'Login Failed',
                description: error,
                variant: 'destructive',
            });
        }
        setIsLoading(false);
    };

    const getRoleBadge = () => {
        if (!userRole) return null;
        switch (userRole) {
            case 'admin':
                return <Badge className="bg-red-600 text-white ml-2"><Shield className="w-3 h-3 mr-1" />Admin</Badge>;
            case 'supervisor':
                return <Badge className="bg-blue-600 text-white ml-2"><Users className="w-3 h-3 mr-1" />Supervisor</Badge>;
            default:
                return <Badge className="bg-gray-600 text-white ml-2"><User className="w-3 h-3 mr-1" />User</Badge>;
        }
    };

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
            {/* Background decorations */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
            </div>

            <Card className="w-full max-w-md relative z-10 border-border/50 shadow-2xl bg-card/95 backdrop-blur-sm">
                <CardHeader className="text-center space-y-4 pb-2">
                    <div className="flex justify-center">
                        <div className="w-20 h-20 flex items-center justify-center">
                            <Image
                                src={planpmLogo}
                                alt="Plan-PM Logo"
                                width={80}
                                height={80}
                                className="object-contain"
                            />
                        </div>
                    </div>
                    <div>
                        <CardTitle className="text-3xl font-bold font-headline text-primary">Welcome to Plan-PM</CardTitle>
                        <CardDescription className="text-base mt-2">
                            Sign in to manage your laboratory instruments
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6 pt-4">
                    {/* Google Sign In - Only for Cloud Deployment */}
                    {isCloudDeployment && (
                        <>
                            <Button
                                variant="outline"
                                className="w-full h-12 text-base font-medium border-2 hover:bg-muted/50 transition-all"
                                onClick={() => signInWithGoogle()}
                                disabled={isLoading}
                            >
                                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                                    <path
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        fill="#4285F4"
                                    />
                                    <path
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        fill="#34A853"
                                    />
                                    <path
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                        fill="#FBBC05"
                                    />
                                    <path
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                        fill="#EA4335"
                                    />
                                </svg>
                                Continue with Google
                            </Button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <Separator className="w-full" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-card px-3 text-muted-foreground">Or continue with username</span>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Username Sign In Form */}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center">
                                <Label htmlFor="username" className="text-sm font-medium">
                                    Username
                                </Label>
                                {isLookingUpRole && <Loader2 className="w-3 h-3 ml-2 animate-spin text-muted-foreground" />}
                                {getRoleBadge()}
                            </div>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="username"
                                    name="plan_username"
                                    type="text"
                                    placeholder="Enter your username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="pl-10 h-11"
                                    disabled={isLoading}
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-sm font-medium">
                                Password
                            </Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    name="plan_password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 pr-10 h-11"
                                    disabled={isLoading}
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <Button type="submit" className="w-full h-11 text-base font-medium" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </Button>
                    </form>

                    <div className="text-center text-sm text-muted-foreground">
                        Contact your administrator if you need an account.
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
