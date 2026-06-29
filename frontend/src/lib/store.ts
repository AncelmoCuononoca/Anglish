import { create } from 'zustand'
import type { User, Avatar } from '../types'

interface AppState {
  user: User | null
  selectedAvatar: Avatar | null
  setUser: (user: User | null) => void
  setSelectedAvatar: (avatar: Avatar) => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  selectedAvatar: null,
  setUser: (user) => set({ user }),
  setSelectedAvatar: (avatar) => set({ selectedAvatar: avatar }),
}))
