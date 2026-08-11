// Onboarding catalog - the learner's objective and, for "work", a wide list of
// professional fields grouped by sector. Strong emphasis on Angola's biggest
// industries (oil & gas, mining) but broad enough to cover most careers.
// Labels are in English (this is an English course) and feed the AI tutor so
// lessons/conversations adapt to the student's field. "Other" lets them type
// their own field manually.
import type { LearnerGoal } from '../types'

export interface GoalOption {
  value: LearnerGoal
  label: string
  emoji: string
  desc: string
}

export const GOAL_OPTIONS: GoalOption[] = [
  { value: 'work',   emoji: '💼', label: 'For work',        desc: 'English for my job or career' },
  { value: 'travel', emoji: '✈️', label: 'For travel',      desc: 'Get around, hotels, airports' },
  { value: 'daily',  emoji: '🏠', label: 'Daily life',      desc: 'Everyday conversations' },
  { value: 'school', emoji: '🎓', label: 'School / study',  desc: 'School, university, courses' },
  { value: 'exam',   emoji: '📝', label: 'Exam prep',       desc: 'IELTS, TOEFL, Cambridge…' },
  { value: 'other',  emoji: '✨', label: 'Something else',  desc: "I'll describe it myself" },
]

// Portuguese labels for the onboarding flow (which is intentionally in PT).
// The `value` field stays in English - it's what gets saved to the DB and used
// by the AI tutor via focus.ts.
export const GOAL_OPTIONS_PT: GoalOption[] = [
  { value: 'work',   emoji: '💼', label: 'Para o trabalho',    desc: 'Inglês para a minha carreira e emprego' },
  { value: 'travel', emoji: '✈️', label: 'Para viajar',        desc: 'Hotéis, aeroportos, turismo' },
  { value: 'daily',  emoji: '🏠', label: 'No dia a dia',       desc: 'Conversas do quotidiano' },
  { value: 'school', emoji: '🎓', label: 'Para estudar',       desc: 'Escola, universidade, cursos' },
  { value: 'exam',   emoji: '📝', label: 'Para um exame',      desc: 'IELTS, TOEFL, Cambridge…' },
  { value: 'other',  emoji: '✨', label: 'Outro motivo',       desc: 'Vou descrever o meu objectivo' },
]

export interface WorkArea { id: string; label: string }
export interface WorkCategory { id: string; label: string; emoji: string; areas: WorkArea[] }

// Each category ends with an "Other in <area>" option that routes to free text.
export const WORK_CATEGORIES: WorkCategory[] = [
  {
    id: 'oil_gas', label: 'Oil & Gas', emoji: '🛢️',
    areas: [
      { id: 'petroleum_eng', label: 'Petroleum Engineering' },
      { id: 'drilling', label: 'Drilling' },
      { id: 'reservoir', label: 'Reservoir / Production Engineering' },
      { id: 'refining', label: 'Refining & Processing' },
      { id: 'pipeline', label: 'Pipeline & Subsea' },
      { id: 'offshore_op', label: 'Offshore Platform Operations' },
      { id: 'geology_exploration', label: 'Geology & Exploration' },
      { id: 'oil_hse', label: 'Health, Safety & Environment (HSE)' },
      { id: 'oil_admin', label: 'Administrative - Oil Company' },
      { id: 'oil_procurement', label: 'Procurement & Logistics - Oil' },
      { id: 'field_operator', label: 'Field / Plant Operator' },
    ],
  },
  {
    id: 'mining', label: 'Mining', emoji: '⛏️',
    areas: [
      { id: 'mining_eng', label: 'Mining Engineering' },
      { id: 'mine_geology', label: 'Geology' },
      { id: 'mineral_processing', label: 'Mineral Processing / Metallurgy' },
      { id: 'drilling_blasting', label: 'Drilling & Blasting' },
      { id: 'mine_equipment', label: 'Heavy Equipment Operation' },
      { id: 'mine_surveying', label: 'Mine Surveying' },
      { id: 'mining_hse', label: 'Health, Safety & Environment (HSE)' },
      { id: 'mining_admin', label: 'Administrative - Mining' },
      { id: 'gemology', label: 'Diamonds / Gemology' },
    ],
  },
  {
    id: 'engineering_tech', label: 'Engineering & Technology', emoji: '⚙️',
    areas: [
      { id: 'civil_eng', label: 'Civil Engineering' },
      { id: 'mechanical_eng', label: 'Mechanical Engineering' },
      { id: 'electrical_eng', label: 'Electrical Engineering' },
      { id: 'software_it', label: 'Software / IT' },
      { id: 'telecom', label: 'Telecommunications' },
      { id: 'industrial_eng', label: 'Industrial Engineering' },
      { id: 'chemical_eng', label: 'Chemical Engineering' },
      { id: 'automotive', label: 'Automotive / Mechanic' },
      { id: 'networking', label: 'Networks & Systems' },
      { id: 'data_ai', label: 'Data / AI' },
    ],
  },
  {
    id: 'health', label: 'Health & Medicine', emoji: '🩺',
    areas: [
      { id: 'doctor', label: 'Doctor / Physician' },
      { id: 'nurse', label: 'Nursing' },
      { id: 'pharmacist', label: 'Pharmacy' },
      { id: 'dentist', label: 'Dentistry' },
      { id: 'lab_tech', label: 'Laboratory Technician' },
      { id: 'physio', label: 'Physiotherapy' },
      { id: 'public_health', label: 'Public Health' },
      { id: 'veterinary', label: 'Veterinary' },
    ],
  },
  {
    id: 'business_admin', label: 'Business & Administration', emoji: '📊',
    areas: [
      { id: 'office_admin', label: 'Administrative / Office' },
      { id: 'accounting', label: 'Accounting' },
      { id: 'finance', label: 'Finance' },
      { id: 'banking', label: 'Banking' },
      { id: 'hr', label: 'Human Resources' },
      { id: 'sales', label: 'Sales' },
      { id: 'marketing', label: 'Marketing' },
      { id: 'project_mgmt', label: 'Project Management' },
      { id: 'procurement', label: 'Procurement' },
      { id: 'entrepreneur', label: 'Entrepreneur / Business Owner' },
    ],
  },
  {
    id: 'construction', label: 'Construction & Trades', emoji: '🏗️',
    areas: [
      { id: 'architecture', label: 'Architecture' },
      { id: 'construction_mgmt', label: 'Construction Management' },
      { id: 'electrician', label: 'Electrician' },
      { id: 'plumbing', label: 'Plumbing' },
      { id: 'welding', label: 'Welding' },
      { id: 'carpentry', label: 'Carpentry' },
      { id: 'surveying', label: 'Surveying' },
    ],
  },
  {
    id: 'hospitality', label: 'Hospitality & Tourism', emoji: '🏨',
    areas: [
      { id: 'hotel', label: 'Hotel / Reception' },
      { id: 'chef', label: 'Restaurant / Chef' },
      { id: 'tour_guide', label: 'Tourism Guide' },
      { id: 'travel_agency', label: 'Travel Agency' },
      { id: 'events', label: 'Events & Catering' },
      { id: 'cabin_crew', label: 'Airline / Cabin Crew' },
    ],
  },
  {
    id: 'transport', label: 'Transport & Logistics', emoji: '🚚',
    areas: [
      { id: 'logistics', label: 'Logistics & Supply Chain' },
      { id: 'driver', label: 'Driving / Transport' },
      { id: 'pilot', label: 'Aviation / Pilot' },
      { id: 'maritime', label: 'Maritime / Shipping' },
      { id: 'customs', label: 'Customs & Freight' },
      { id: 'warehouse', label: 'Warehouse Operations' },
    ],
  },
  {
    id: 'education', label: 'Education & Research', emoji: '📚',
    areas: [
      { id: 'teacher', label: 'Teacher' },
      { id: 'academia', label: 'University / Academia' },
      { id: 'translation', label: 'Translation / Interpreting' },
      { id: 'research', label: 'Research' },
    ],
  },
  {
    id: 'law_gov', label: 'Law & Government', emoji: '⚖️',
    areas: [
      { id: 'lawyer', label: 'Law / Lawyer' },
      { id: 'public_admin', label: 'Public Administration' },
      { id: 'police_security', label: 'Police / Security Forces' },
      { id: 'military', label: 'Military' },
      { id: 'diplomacy', label: 'Diplomacy / International Relations' },
      { id: 'ngo', label: 'NGO / Humanitarian' },
    ],
  },
  {
    id: 'agriculture', label: 'Agriculture & Environment', emoji: '🌱',
    areas: [
      { id: 'agriculture', label: 'Agriculture / Farming' },
      { id: 'fishing', label: 'Fishing' },
      { id: 'forestry', label: 'Forestry' },
      { id: 'environment', label: 'Environmental Science' },
      { id: 'livestock', label: 'Livestock' },
    ],
  },
  {
    id: 'media_creative', label: 'Media & Creative', emoji: '🎬',
    areas: [
      { id: 'journalism', label: 'Journalism' },
      { id: 'design', label: 'Design / Graphic Design' },
      { id: 'photography', label: 'Photography' },
      { id: 'music', label: 'Music' },
      { id: 'film_tv', label: 'Film / TV' },
      { id: 'content', label: 'Content Creation / Social Media' },
      { id: 'advertising', label: 'Advertising' },
    ],
  },
  {
    id: 'retail_services', label: 'Retail & Services', emoji: '🛍️',
    areas: [
      { id: 'retail', label: 'Retail / Shop' },
      { id: 'customer_service', label: 'Customer Service' },
      { id: 'call_center', label: 'Call Center' },
      { id: 'beauty', label: 'Beauty / Hairdressing' },
      { id: 'security_guard', label: 'Security Guard' },
      { id: 'domestic', label: 'Domestic Work' },
    ],
  },
]

// General / basic education — for students who are still in school (not yet
// training for a specific field). Shown first in the study flow, before the
// professional fields (which a university/technical student studies FOR).
export const GENERAL_STUDY: WorkCategory = {
  id: 'general_ed', label: 'General / school', emoji: '🏫',
  areas: [
    { id: 'primary',        label: 'Primary school' },
    { id: 'secondary',      label: 'Secondary school (I Ciclo)' },
    { id: 'high_school',    label: 'High school (Ensino Médio)' },
    { id: 'university_gen', label: 'University (general)' },
    { id: 'just_english',   label: 'Just improving my English' },
  ],
}

// Study flow: general education first, then the same professional fields as work
// (a student studies TO enter one of these sectors).
export const STUDY_CATEGORIES: WorkCategory[] = [GENERAL_STUDY, ...WORK_CATEGORIES]

// Build the focus phrase saved as goal_detail and fed to the AI tutor.
export function buildGoalDetail(categoryLabel: string, areaLabel: string): string {
  return `${areaLabel} (${categoryLabel})`
}

// Same, for a student. General education → just the level; a professional field
// → "Studying <field> (<sector>)" so the tutor knows what they train for.
export function buildStudyDetail(categoryLabel: string, areaLabel: string): string {
  if (categoryLabel === GENERAL_STUDY.label) return `Studying: ${areaLabel}`
  return `Studying ${areaLabel} (${categoryLabel})`
}
