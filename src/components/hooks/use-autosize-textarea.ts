import { useEffect } from "react"

export function useAutosizeTextArea(
  textAreaRef: HTMLTextAreaElement | null,
  value: string,
  maxHeight?: number
) {
  useEffect(() => {
    if (textAreaRef) {
      // Reset height to auto to get the correct scrollHeight
      textAreaRef.style.height = "auto"
      
      const scrollHeight = textAreaRef.scrollHeight
      
      // Set height based on content, respecting maxHeight if provided
      if (maxHeight && scrollHeight > maxHeight) {
        textAreaRef.style.height = `${maxHeight}px`
        textAreaRef.style.overflowY = "auto"
      } else {
        textAreaRef.style.height = `${scrollHeight}px`
        textAreaRef.style.overflowY = "hidden"
      }
    }
  }, [textAreaRef, value, maxHeight])
}