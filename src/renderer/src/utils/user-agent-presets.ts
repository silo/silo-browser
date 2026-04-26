export interface UserAgentPreset {
  id: string
  label: string
  value: string
}

export const UA_PRESETS: UserAgentPreset[] = [
  {
    id: 'chrome-windows',
    label: 'Chrome on Windows',
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  },
  {
    id: 'chrome-macos',
    label: 'Chrome on macOS',
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  },
  {
    id: 'safari-macos',
    label: 'Safari on macOS',
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15'
  },
  {
    id: 'edge-windows',
    label: 'Edge on Windows',
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
  },
  {
    id: 'firefox-windows',
    label: 'Firefox on Windows',
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'
  }
]

export function matchPreset(ua: string): string {
  if (!ua) return ''
  const preset = UA_PRESETS.find((p) => p.value === ua)
  return preset ? preset.id : 'custom'
}
