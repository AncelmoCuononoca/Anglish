function xpToLevel(xp: number): string {
  if (xp >= 8000) return 'C2'
  if (xp >= 5000) return 'C1'
  if (xp >= 3000) return 'B2'
  if (xp >= 1500) return 'B1'
  if (xp >= 500)  return 'A2'
  return 'A1'
}

export interface NpcProfile {
  id: string
  name: string
  xp: number
  streak: number
  level: string
}

const RAW: Omit<NpcProfile, 'level'>[] = [
  { id: 'npc-001', name: 'Rafael Costa',       xp: 4200, streak: 31 },
  { id: 'npc-002', name: 'Isabela Ferreira',   xp: 3800, streak: 28 },
  { id: 'npc-003', name: 'Miguel Santos',      xp: 3500, streak: 22 },
  { id: 'npc-004', name: 'Beatriz Lima',       xp: 3100, streak: 18 },
  { id: 'npc-005', name: 'Kiluanje Domingos',  xp: 2800, streak: 15 },
  { id: 'npc-006', name: 'Sofia Almeida',      xp: 2600, streak: 12 },
  { id: 'npc-007', name: 'Lucas Rodrigues',    xp: 2400, streak: 10 },
  { id: 'npc-008', name: 'Amina Machava',      xp: 2100, streak:  9 },
  { id: 'npc-009', name: 'João Pereira',       xp: 1900, streak:  7 },
  { id: 'npc-010', name: 'Yola Ndala',         xp: 1700, streak:  6 },
  { id: 'npc-011', name: 'Camila Barbosa',     xp: 1500, streak:  5 },
  { id: 'npc-012', name: 'Diogo Ribeiro',      xp: 1300, streak:  4 },
  { id: 'npc-013', name: 'Felicidade Sitoe',   xp: 1100, streak:  3 },
  { id: 'npc-014', name: 'Tomás Baptista',     xp:  950, streak:  3 },
  { id: 'npc-015', name: 'Inês Carvalho',      xp:  800, streak:  2 },
  { id: 'npc-016', name: 'Carlos Mondlane',    xp:  680, streak:  2 },
  { id: 'npc-017', name: 'Mavinga Tchissola',  xp:  580, streak:  2 },
  { id: 'npc-018', name: 'Margarida Vaz',      xp:  480, streak:  1 },
  { id: 'npc-019', name: 'Rodrigo Gomes',      xp:  380, streak:  1 },
  { id: 'npc-020', name: 'Catarina Teixeira',  xp:  290, streak:  0 },
  { id: 'npc-021', name: 'Marta Nhantumbo',    xp:  200, streak:  0 },
  { id: 'npc-022', name: 'Filipe Henriques',   xp:  150, streak:  0 },
  { id: 'npc-023', name: 'Ana Monteiro',       xp:  100, streak:  0 },
]

export const NPC_PROFILES: NpcProfile[] = RAW.map(n => ({ ...n, level: xpToLevel(n.xp) }))
