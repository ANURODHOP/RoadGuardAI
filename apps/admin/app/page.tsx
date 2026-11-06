'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { Shield, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Verify admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profileError || !profile || !['admin', 'moderator'].includes(profile.role)) {
      await supabase.auth.signOut()
      setError('Access denied. Administrator privileges required for this portal.')
      setLoading(false)
      return
    }

    router.replace('/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 text-slate-900">
      {/* Top bar */}
      <header className="h-16 border-b border-slate-200 bg-white px-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-white shadow-xs">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 tracking-tight text-sm">RoadGuard Operations</span>
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
              OFFICIAL USE ONLY
            </span>
          </div>
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Municipal Infrastructure Monitoring
        </div>
      </header>

      {/* Main card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Administrator Sign In
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Enter your authorized credentials to access municipal road telemetry and case management.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  Authorized Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-colors"
                    placeholder="admin@roadguard.ai"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
                  >
                    Security Password
                  </label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-colors"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-rose-800">{error}</p>
                </div>
              )}

              <button
                id="btn-admin-login"
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:opacity-60 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>Sign In to Dashboard</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Protected by Supabase Role-Based Row Level Security</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-12 border-t border-slate-200 bg-white px-8 flex items-center justify-between text-xs text-slate-400">
        <span>RoadGuard Civic Incident Management Platform</span>
        <span>Audited & Encrypted</span>
      </footer>
    </div>
  )
}
