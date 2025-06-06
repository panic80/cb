import { useCallback, useState } from "react"

export interface UseCopyToClipboardReturn {
  isCopied: boolean
  copyToClipboard: (text: string) => Promise<boolean>
  error: string | null
}

export function useCopyToClipboard(timeout = 2000): UseCopyToClipboardReturn {
  const [isCopied, setIsCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const copyToClipboard = useCallback(
    async (text: string): Promise<boolean> => {
      if (!navigator?.clipboard) {
        setError("Clipboard not supported")
        return false
      }

      try {
        await navigator.clipboard.writeText(text)
        setIsCopied(true)
        setError(null)
        
        setTimeout(() => {
          setIsCopied(false)
        }, timeout)
        
        return true
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to copy"
        setError(errorMessage)
        setIsCopied(false)
        return false
      }
    },
    [timeout]
  )

  return {
    isCopied,
    copyToClipboard,
    error,
  }
}