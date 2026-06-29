import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../lib/supabase'

export const schedulingRouter = Router()

const bookingSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  whatsapp: z.string().min(8),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  preferred_date: z.string(),
  notes: z.string().optional(),
})

schedulingRouter.post('/', async (req, res) => {
  try {
    const data = bookingSchema.parse(req.body)

    const { error } = await supabase.from('scheduled_lessons').insert({
      ...data,
      status: 'pending',
    })
    if (error) throw error

    // WhatsApp notification to admin via Twilio
    const adminMsg = `📅 *New Class Request*\n\nStudent: ${data.name}\nEmail: ${data.email}\nWhatsApp: ${data.whatsapp}\nLevel: ${data.level}\nDate: ${data.preferred_date}\nNotes: ${data.notes ?? 'None'}`

    if (process.env.TWILIO_ACCOUNT_SID) {
      const twilio = (await import('twilio')).default
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
        to: `whatsapp:${process.env.ADMIN_WHATSAPP}`,
        body: adminMsg,
      })
    }

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Booking failed' })
  }
})

schedulingRouter.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('scheduled_lessons')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})
