export interface Hint {
  keys: string[]
  label: string
}

/** The bottom bar listing the current page's keyboard shortcuts. */
export default function HintBar({ hints }: { hints: Hint[] }) {
  return (
    <footer className="hintbar">
      <p className="hintbar-device">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M6 10h1M10 10h1M14 10h1M18 10h0M7 14h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Keyboard
      </p>
      <ul className="hintbar-list" aria-label="Keyboard shortcuts">
        {hints.map((hint) => (
          <li key={hint.label}>
            {hint.keys.map((key) => (
              <kbd key={key}>{key}</kbd>
            ))}
            <span>{hint.label}</span>
          </li>
        ))}
      </ul>
    </footer>
  )
}
