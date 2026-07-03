import { useRef, useState, useCallback } from 'react'
import { API_BASE as API } from '../lib/apiBase'

// Each call alternates speed: normal (1.0) → slow (0.6) → normal → slow …
export function useTts(voice = 'alloy') {
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  // tracks how many times this hook instance has been played (for speed toggle)
  const playCountRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const speak = useCallback(async (text: string, token?: string) => {
    if (!text.trim()) return
    // stop any current playback
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }

    // alternate: even count = normal, odd count = slow
    const isSlow = playCountRef.current % 2 === 1
    const speed = isSlow ? 0.62 : 1.0
    playCountRef.current += 1

    setLoading(true)
    try {
      const res = await fetch(`${API}/api/speaking/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, voice, speed }),
      })
      if (!res.ok) throw new Error('TTS failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url) }
      setPlaying(true)
      await audio.play()
    } catch (e) {
      console.error('TTS error', e)
    } finally {
      setLoading(false)
    }
  }, [voice])

  const stop = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    setPlaying(false)
  }, [])

  return { speak, stop, loading, playing }
}
