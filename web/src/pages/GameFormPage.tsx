import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { createGame, deleteGame, errorMessage, getCurrentUser, getGame, updateGame } from '../lib/api.ts'
import { CORES, extensionsFor, gameFileProblem } from '../lib/gameFile.ts'
import type { EmulatorCore, Game, GameInput } from '../lib/types.ts'
import { useShortcuts } from '../lib/useShortcuts.ts'

const EMPTY: GameInput = { title: '', description: '', genre: '', core: 'nes' }

/**
 * Add a game (/games/new) or edit one (/games/:gameId/edit). Edit also deletes,
 * after an inline confirmation. The server checks sign-in and ownership; this
 * page only catches mistakes before a call and shows the server's message.
 */
export default function GameFormPage() {
  const { gameId } = useParams()
  const isEdit = gameId !== undefined
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const user = getCurrentUser()

  const [game, setGame] = useState<Game | null>(null)
  const [input, setInput] = useState<GameInput>(EMPTY)
  const [file, setFile] = useState<File | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const cancelDeleteRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    getGame(gameId)
      .then((loaded) => {
        if (cancelled) return
        setGame(loaded)
        setInput({ title: loaded.title, description: loaded.description, genre: loaded.genre, core: loaded.core })
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLoadError(errorMessage(reason))
      })
    return () => {
      cancelled = true
    }
  }, [gameId, isEdit])

  // Focus the safe choice when the confirmation opens, and Delete… again when it closes.
  const confirmWasOpen = useRef(false)
  useEffect(() => {
    if (confirmDelete) cancelDeleteRef.current?.focus()
    else if (confirmWasOpen.current) deleteRef.current?.focus()
    confirmWasOpen.current = confirmDelete
  }, [confirmDelete])

  useShortcuts({
    Escape: () => {
      if (confirmDelete) setConfirmDelete(false)
      else navigate(isEdit ? `/games/${gameId}` : '/')
    },
  })

  function update<K extends keyof GameInput>(key: K, value: GameInput[K]) {
    setInput((current) => ({ ...current, [key]: value }))
  }

  /** A plain message for the first thing wrong with the form, or null. */
  function formProblem(trimmed: GameInput): string | null {
    if (!trimmed.title) return 'Give the game a title.'
    if (!trimmed.genre) return 'Give the game a genre, for example Puzzle.'
    if (!isEdit) {
      if (!file) return 'Choose the game file.'
      return gameFileProblem(file.name, file.size, trimmed.core)
    }
    return null
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed: GameInput = {
      ...input,
      title: input.title.trim(),
      description: input.description.trim(),
      genre: input.genre.trim(),
    }
    const problem = formProblem(trimmed)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = isEdit ? await updateGame(gameId, trimmed) : await createGame(trimmed, file!)
      navigate(`/games/${saved.id}`)
    } catch (reason) {
      setError(errorMessage(reason))
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!isEdit) return
    setBusy(true)
    setError(null)
    try {
      await deleteGame(gameId)
      navigate('/')
    } catch (reason) {
      setError(errorMessage(reason))
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  const heading = isEdit ? 'Edit game' : 'Add a game'

  if (!user) {
    return (
      <div className="panel panel-narrow">
        <h1>{heading}</h1>
        <p className="muted">Sign in to add or edit games.</p>
        <div className="actions">
          <Link to={`/sign-in?next=${encodeURIComponent(pathname)}`} className="button primary">
            Sign in
          </Link>
          <Link to="/" className="button">
            Back to the library
          </Link>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="panel">
        <h1>Game not available</h1>
        <p className="error" role="alert">
          {loadError}
        </p>
        <Link to="/" className="button">
          Back to the library
        </Link>
      </div>
    )
  }
  if (isEdit && !game) return <p className="muted">Loading…</p>

  const backTo = isEdit ? `/games/${gameId}` : '/'
  const accept = extensionsFor(input.core).join(',')

  return (
    <div className="panel">
      <Link to={backTo} className="back-link">
        <span aria-hidden="true">‹</span> {isEdit ? game!.title : 'Library'}
      </Link>
      <h1>{heading}</h1>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <label>
          Title
          <input
            name="title"
            required
            maxLength={100}
            value={input.title}
            onChange={(event) => update('title', event.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            rows={4}
            maxLength={1000}
            value={input.description}
            onChange={(event) => update('description', event.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Genre
            <input
              name="genre"
              required
              maxLength={40}
              value={input.genre}
              onChange={(event) => update('genre', event.target.value)}
            />
          </label>
          <label>
            Console
            <select
              name="core"
              value={input.core}
              onChange={(event) => update('core', event.target.value as EmulatorCore)}
            >
              {CORES.map((entry) => (
                <option key={entry.core} value={entry.core}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!isEdit && (
          <label>
            Game file
            <input
              name="file"
              type="file"
              required
              accept={accept}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <span className="hint">
              Only freely shareable homebrew games. Ends in {extensionsFor(input.core).join(' or ')}.
            </span>
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="primary button-large" disabled={busy}>
            {isEdit ? 'Save changes' : 'Add game'}
          </button>
          <Link to={backTo} className="button">
            Cancel
          </Link>
        </div>
      </form>

      {isEdit && (
        <section className="danger-zone" aria-labelledby="delete-heading">
          <h2 id="delete-heading">Delete this game</h2>
          {confirmDelete ? (
            <div role="group" aria-labelledby="delete-question">
              <p id="delete-question">
                Delete {game!.title}? This can&apos;t be undone.
              </p>
              <div className="actions">
                <button type="button" className="danger" disabled={busy} onClick={handleDelete}>
                  Delete game
                </button>
                <button
                  type="button"
                  ref={cancelDeleteRef}
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="muted">Removes it from the library for everyone.</p>
              <button type="button" ref={deleteRef} className="danger" onClick={() => setConfirmDelete(true)}>
                Delete…
              </button>
            </>
          )}
        </section>
      )}
    </div>
  )
}
