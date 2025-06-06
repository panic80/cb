import { useCallback, useRef, useState } from "react"

export interface AudioRecordingState {
  isRecording: boolean
  isSupported: boolean
  duration: number
  audioBlob: Blob | null
  error: string | null
}

export interface AudioRecordingControls {
  startRecording: () => Promise<void>
  stopRecording: () => Promise<Blob | null>
  cancelRecording: () => void
  clearError: () => void
}

export interface UseAudioRecordingOptions {
  mimeType?: string
  audioBitsPerSecond?: number
  onDataAvailable?: (event: BlobEvent) => void
  onError?: (error: Error) => void
}

export function useAudioRecording(
  options: UseAudioRecordingOptions = {}
): AudioRecordingState & AudioRecordingControls {
  const {
    mimeType = "audio/webm",
    audioBitsPerSecond = 128000,
    onDataAvailable,
    onError,
  } = options

  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const isSupported = typeof navigator !== "undefined" && 
    "mediaDevices" in navigator && 
    "getUserMedia" in navigator.mediaDevices &&
    typeof MediaRecorder !== "undefined"

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      const error = new Error("Audio recording is not supported")
      setError(error.message)
      onError?.(error)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond,
      })
      mediaRecorderRef.current = mediaRecorder

      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
          onDataAvailable?.(event)
        }
      }

      mediaRecorder.onstart = () => {
        setIsRecording(true)
        setDuration(0)
        setError(null)
        
        // Start duration timer
        durationIntervalRef.current = setInterval(() => {
          setDuration(prev => prev + 100)
        }, 100)
      }

      mediaRecorder.onstop = () => {
        setIsRecording(false)
        
        // Clear duration timer
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current)
          durationIntervalRef.current = null
        }

        // Create blob from chunks
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType })
          setAudioBlob(blob)
        }

        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
      }

      mediaRecorder.onerror = (event) => {
        const error = new Error(`MediaRecorder error: ${event.error?.message || 'Unknown error'}`)
        setError(error.message)
        setIsRecording(false)
        onError?.(error)
      }

      mediaRecorder.start(100) // Collect data every 100ms
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to start recording")
      setError(error.message)
      setIsRecording(false)
      onError?.(error)
    }
  }, [isSupported, mimeType, audioBitsPerSecond, onDataAvailable, onError])

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (mediaRecorderRef.current && isRecording) {
      return new Promise((resolve) => {
        const mediaRecorder = mediaRecorderRef.current!
        
        const handleStop = () => {
          mediaRecorder.removeEventListener('stop', handleStop)
          resolve(audioBlob)
        }
        
        mediaRecorder.addEventListener('stop', handleStop)
        mediaRecorder.stop()
      })
    }
    return null
  }, [isRecording, audioBlob])

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setAudioBlob(null)
      chunksRef.current = []
    }
    
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    
    setIsRecording(false)
    setDuration(0)
  }, [isRecording])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isRecording,
    isSupported,
    duration,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  }
}