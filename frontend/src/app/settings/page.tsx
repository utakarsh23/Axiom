"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
    const router = useRouter();

    const handleLogout = () => {
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
        localStorage.removeItem("rawGithubToken");
        document.cookie = "auth-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        router.push("/");
    };

    return (
        <div className="flex flex-col h-full w-full p-6 lg:p-10 bg-[#F8F7F5] overflow-y-auto">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-white border border-[#E5E3E0] flex items-center justify-center shrink-0">
                    <SettingsIcon className="w-5 h-5 text-[#231F20]" />
                </div>
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-[#231F20]">Settings</h1>
                    <p className="text-[#6B6868] text-sm mt-1">Manage your account and application preferences.</p>
                </div>
            </div>

            <div className="grid gap-6 max-w-2xl">
                <Card className="bg-white border-[#E5E3E0] shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg">Account Actions</CardTitle>
                        <CardDescription>Sign out of your active session.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="destructive"
                            onClick={handleLogout}
                            className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 shadow-none font-semibold transition-colors"
                        >
                            <LogOut className="w-4 h-4 mr-2" />
                            Log Out
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}