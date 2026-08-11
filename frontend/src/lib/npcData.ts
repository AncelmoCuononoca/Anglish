export interface NpcProfile {
  id: string
  name: string
  xp: number
  streak: number
  level: string
  avatar?: string   // photo / mascot / cartoon shown in the leaderboard
}

// Showcase profiles that seed the leaderboard alongside real users. XP values are
// kept ~10× smaller than a "real" CEFR level would imply on purpose: the live
// scoring only awards a handful of points per lesson, so huge numbers looked
// absurd next to real students. The `level` is fixed here (not derived from xp)
// so the podium still shows the aspirational C2/B2/B1 badges.
export const NPC_PROFILES: NpcProfile[] = [
  { id: 'npc-001', name: 'Rafael Costa',       xp: 875, streak: 31, level: 'C2', avatar: '/mascots/bust/month03.png' },
  { id: 'npc-002', name: 'Isabela Ferreira',   xp: 380, streak: 28, level: 'B2', avatar: '/npc/isabela.jpg' },
  { id: 'npc-003', name: 'Miguel Santos',      xp: 350, streak: 22, level: 'B2', avatar: '/npc/miguel.png' },
  { id: 'npc-004', name: 'Beatriz Lima',       xp: 349, streak: 18, level: 'B2', avatar: '/mascots/bust/month02.png' },
  { id: 'npc-005', name: 'Kiluanje Domingos',  xp: 280, streak: 15, level: 'B1', avatar: '/mascots/bust/month11.png' },
  { id: 'npc-006', name: 'Sofia Almeida',      xp: 260, streak: 12, level: 'B1', avatar: '/npc/sofia.jpg' },
  { id: 'npc-007', name: 'Lucas Rodrigues',    xp: 240, streak: 10, level: 'B1' },
  { id: 'npc-008', name: 'Amina Machava',      xp: 239, streak:  9, level: 'B1', avatar: '/npc/amina.jpg' },
  { id: 'npc-009', name: 'João Pereira',       xp: 208, streak:  7, level: 'B1', avatar: '/npc/joao.jpg' },
  { id: 'npc-010', name: 'Yola Ndala',         xp: 170, streak:  6, level: 'B1' },
  { id: 'npc-011', name: 'Camila Barbosa',     xp: 150, streak:  5, level: 'B1' },
  { id: 'npc-012', name: 'Diogo Ribeiro',      xp: 130, streak:  4, level: 'A2' },
  { id: 'npc-013', name: 'Felicidade Sitoe',   xp: 110, streak:  3, level: 'A2' },
  { id: 'npc-014', name: 'Tomás Baptista',     xp:  95, streak:  3, level: 'A2' },
  { id: 'npc-015', name: 'Inês Carvalho',      xp:  80, streak:  2, level: 'A2' },
  { id: 'npc-016', name: 'Carlos Mondlane',    xp:  68, streak:  2, level: 'A2' },
  { id: 'npc-017', name: 'Mavinga Tchissola',  xp:  58, streak:  2, level: 'A2' },
  { id: 'npc-018', name: 'Margarida Vaz',      xp:  48, streak:  1, level: 'A1' },
  { id: 'npc-019', name: 'Rodrigo Gomes',      xp:  38, streak:  1, level: 'A1' },
  { id: 'npc-020', name: 'Catarina Teixeira',  xp:  29, streak:  0, level: 'A1' },
  { id: 'npc-021', name: 'Marta Nhantumbo',    xp:  20, streak:  0, level: 'A1' },
  { id: 'npc-022', name: 'Filipe Henriques',   xp:  15, streak:  0, level: 'A1' },
  { id: 'npc-023', name: 'Ana Monteiro',       xp:  10, streak:  0, level: 'A1' },
]
