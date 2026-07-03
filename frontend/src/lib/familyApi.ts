// Family plan - parent manages their own family's accounts. All calls hit
// /api/family/* (requireAuth + ownership check on the server).
import { supabase } from './supabase'
import type { FamilyMember, Level } from '../types'
import { API_BASE as API } from './apiBase'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export interface FamilyResponse {
  familyId: string
  max: number
  members: FamilyMember[]
}

export async function fetchFamily(): Promise<FamilyResponse> {
  const res = await fetch(`${API}/api/family/members`, { headers: await authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Could not load family')
  }
  return res.json()
}

export interface NewMember {
  name: string
  email: string
  password: string
  level?: Level
}

export async function createMember(payload: NewMember): Promise<FamilyMember> {
  const res = await fetch(`${API}/api/family/members`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Could not add member')
  }
  return res.json()
}

export async function updateMember(
  id: string,
  updates: { level?: Level; access_end?: string | null },
): Promise<FamilyMember> {
  const res = await fetch(`${API}/api/family/members/${id}`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Update failed')
  }
  return res.json()
}

export async function removeMember(id: string): Promise<void> {
  const res = await fetch(`${API}/api/family/members/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Could not remove member')
  }
}
