"use client";

// Auth page: GitHub OAuth login, profile fetch, JWT handling
import { useEffect, useState } from "react";

export default function AuthPage() {
    const [profile, setProfile] = useState(null);
    useEffect(() => {
        fetch("/auth/me", { credentials: "include" })
            .then(res => res.json())
            .then(setProfile);
    }, []);
    return (
        <div>
            <h1>Login / Profile</h1>
            <a href="/auth/github">Login with GitHub</a>
            {profile && <pre>{JSON.stringify(profile, null, 2)}</pre>}
        </div>
    );
}