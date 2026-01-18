'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Key, Shield, User as UserIcon, Users, Pencil } from 'lucide-react';
import { AddUserDialog } from '@/components/admin/add-user-dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface UserData {
    id: string;
    email: string;
    displayName: string;
    role: 'admin' | 'supervisor' | 'user';
    permissions: Record<string, string>;
    passwordResetRequired: boolean;
    isSuperAdmin: boolean;
    createdAt: string;
}

export default function UserManagementPage() {
    const { user, session, isAdmin, hasPermission } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [users, setUsers] = useState<UserData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
    const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
    const [editUser, setEditUser] = useState<UserData | null>(null);

    useEffect(() => {
        if (!hasPermission('user_management', 'view')) {
            router.push('/');
            return;
        }
        fetchUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/admin/users', {
                headers: { Authorization: `Bearer ${session?.access_token}` },
            });
            const data = await res.json();
            if (data.users) {
                setUsers(data.users);
            }
        } catch (err) {
            console.error('Error fetching users:', err);
            toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteUserId) return;
        try {
            const res = await fetch(`/api/admin/users?userId=${deleteUserId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${session?.access_token}` },
            });
            if (res.ok) {
                toast({ title: 'Success', description: 'User deleted successfully' });
                fetchUsers();
            } else {
                const data = await res.json();
                toast({ title: 'Error', description: data.error, variant: 'destructive' });
            }
        } catch (err) {
            toast({ title: 'Error', description: 'Failed to delete user', variant: 'destructive' });
        } finally {
            setDeleteUserId(null);
        }
    };

    const handleResetPassword = async (newPassword: string) => {
        if (!resetPasswordUserId) return;
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ userId: resetPasswordUserId, password: newPassword }),
            });
            if (res.ok) {
                toast({ title: 'Success', description: 'Password reset successfully' });
                fetchUsers();
            } else {
                const data = await res.json();
                toast({ title: 'Error', description: data.error, variant: 'destructive' });
            }
        } catch (err) {
            toast({ title: 'Error', description: 'Failed to reset password', variant: 'destructive' });
        } finally {
            setResetPasswordUserId(null);
        }
    };

    const handleUpdateUser = async (updatedData: Partial<UserData>) => {
        if (!editUser) return;
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ userId: editUser.id, ...updatedData }),
            });
            if (res.ok) {
                toast({ title: 'Success', description: 'User updated successfully' });
                fetchUsers();
                setEditUser(null);
            } else {
                const data = await res.json();
                toast({ title: 'Error', description: data.error, variant: 'destructive' });
            }
        } catch (err) {
            toast({ title: 'Error', description: 'Failed to update user', variant: 'destructive' });
        }
    };

    const getRoleBadge = (role: string, isSuperAdmin: boolean) => {
        if (isSuperAdmin) return <Badge className="bg-purple-600 text-white"><Shield className="w-3 h-3 mr-1" />Super Admin</Badge>;
        switch (role) {
            case 'admin': return <Badge className="bg-red-600 text-white"><Shield className="w-3 h-3 mr-1" />Admin</Badge>;
            case 'supervisor': return <Badge className="bg-blue-600 text-white"><Users className="w-3 h-3 mr-1" />Supervisor</Badge>;
            default: return <Badge className="bg-gray-600 text-white"><UserIcon className="w-3 h-3 mr-1" />User</Badge>;
        }
    };

    const getPermissionBadge = (level: string) => {
        switch (level) {
            case 'edit': return <Badge variant="outline" className="text-green-600 border-green-600">Edit</Badge>;
            case 'view': return <Badge variant="outline" className="text-blue-600 border-blue-600">View</Badge>;
            default: return <Badge variant="outline" className="text-gray-400 border-gray-400">Hidden</Badge>;
        }
    };

    if (!hasPermission('user_management', 'view')) return null;

    return (
        <div className="flex-1 space-y-6 p-4 md:p-6 pt-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight font-headline">User Management</h2>
                    <p className="text-muted-foreground">Manage users and their permissions</p>
                </div>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add User
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Users ({users.length})</CardTitle>
                    <CardDescription>All registered users and their access levels</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8 text-muted-foreground">Loading users...</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Dashboard</TableHead>
                                        <TableHead>History</TableHead>
                                        <TableHead>Update</TableHead>
                                        <TableHead>Instruments</TableHead>
                                        <TableHead>Templates</TableHead>
                                        <TableHead>Settings</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map(userData => (
                                        <TableRow key={userData.id}>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">{userData.displayName}</div>
                                                    {userData.passwordResetRequired && (
                                                        <Badge variant="outline" className="text-orange-600 border-orange-600 text-xs mt-1">
                                                            Password Reset Required
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>{getRoleBadge(userData.role, userData.isSuperAdmin)}</TableCell>
                                            <TableCell>{getPermissionBadge(userData.permissions?.dashboard)}</TableCell>
                                            <TableCell>{getPermissionBadge(userData.permissions?.maintenance_history)}</TableCell>
                                            <TableCell>{getPermissionBadge(userData.permissions?.update_maintenance)}</TableCell>
                                            <TableCell>{getPermissionBadge(userData.permissions?.instruments)}</TableCell>
                                            <TableCell>{getPermissionBadge(userData.permissions?.design_templates)}</TableCell>
                                            <TableCell>{getPermissionBadge(userData.permissions?.settings)}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex gap-2 justify-end">
                                                    <Button size="sm" variant="outline" onClick={() => setEditUser(userData)} disabled={userData.isSuperAdmin}>
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button size="sm" variant="outline" onClick={() => setResetPasswordUserId(userData.id)} disabled={userData.isSuperAdmin && userData.id !== user?.id}>
                                                        <Key className="w-4 h-4" />
                                                    </Button>
                                                    <Button size="sm" variant="destructive" onClick={() => setDeleteUserId(userData.id)} disabled={userData.isSuperAdmin || userData.id === user?.id}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <AddUserDialog isOpen={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onSuccess={fetchUsers} />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete User?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Reset Password Dialog */}
            <ResetPasswordDialog isOpen={!!resetPasswordUserId} onClose={() => setResetPasswordUserId(null)} onSubmit={handleResetPassword} />

            {/* Edit User Dialog */}
            <EditUserDialog user={editUser} onClose={() => setEditUser(null)} onSave={handleUpdateUser} />
        </div>
    );
}

// Reset Password Dialog
function ResetPasswordDialog({ isOpen, onClose, onSubmit }: { isOpen: boolean; onClose: () => void; onSubmit: (password: string) => void }) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = () => {
        if (password !== confirmPassword) { setError('Passwords do not match'); return; }
        if (password.length < 8) { setError('Min 8 characters'); return; }
        if (!/[A-Z]/.test(password)) { setError('Uppercase required'); return; }
        if (!/[a-z]/.test(password)) { setError('Lowercase required'); return; }
        if (!/[0-9]/.test(password)) { setError('Number required'); return; }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) { setError('Special char required'); return; }
        onSubmit(password);
        setPassword(''); setConfirmPassword(''); setError('');
    };

    return (
        <AlertDialog open={isOpen} onOpenChange={onClose}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Reset User Password</AlertDialogTitle>
                    <AlertDialogDescription>Set a new temporary password.</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-4 py-4">
                    <div>
                        <label className="text-sm font-medium">New Password</label>
                        <input type="password" className="w-full mt-1 px-3 py-2 border rounded-md bg-background" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars, upper, lower, number, special" />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Confirm Password</label>
                        <input type="password" className="w-full mt-1 px-3 py-2 border rounded-md bg-background" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => { setPassword(''); setConfirmPassword(''); setError(''); }}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSubmit}>Reset Password</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// Edit User Dialog
function EditUserDialog({ user, onClose, onSave }: { user: UserData | null; onClose: () => void; onSave: (data: any) => void }) {
    const [role, setRole] = useState<string>('user');
    const [permissions, setPermissions] = useState<Record<string, string>>({});

    useEffect(() => {
        if (user) {
            setRole(user.role);
            setPermissions(user.permissions || {});
        }
    }, [user]);

    const permissionKeys = ['dashboard', 'maintenance_history', 'update_maintenance', 'instruments', 'design_templates', 'settings', 'user_management'];
    const permissionLabels: Record<string, string> = {
        dashboard: 'Dashboard', maintenance_history: 'Maintenance History', update_maintenance: 'Update Maintenance',
        instruments: 'Instruments', design_templates: 'Design Templates', settings: 'Settings', user_management: 'User Management'
    };

    const handleSave = () => {
        onSave({ role, permissions });
    };

    if (!user) return null;

    return (
        <Dialog open={!!user} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit User: {user.displayName}</DialogTitle>
                    <DialogDescription>Update role and permissions</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div>
                        <Label>Role</Label>
                        <Select value={role} onValueChange={setRole}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="supervisor">Supervisor</SelectItem>
                                <SelectItem value="user">User</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Permissions</Label>
                        {permissionKeys.map(key => (
                            <div key={key} className="flex items-center justify-between py-1">
                                <span className="text-sm">{permissionLabels[key]}</span>
                                <Select value={permissions[key] || 'hidden'} onValueChange={(v) => setPermissions(prev => ({ ...prev, [key]: v }))}>
                                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="hidden">Hidden</SelectItem>
                                        <SelectItem value="view">View</SelectItem>
                                        <SelectItem value="edit">Edit</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
