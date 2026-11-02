// The contract between pages and the API (see CLAUDE.md, "The data contract").
// The types live in packages/contracts as zod schemas; this file re-exports
// them, so pages keep importing from here. Type-only, so zod never reaches the
// browser bundle.
// Changing a type is a contract change: its own PR, reviewed by Kenyang and Soham.

export type {
  AuthResponse,
  Credentials,
  EmulatorCore,
  Game,
  GameInput,
  GameQuery,
  ProblemDetails,
  Save,
  SaveKind,
  Session,
  SessionStatus,
  StartSessionRequest,
  StartSessionResponse,
  UpdateSessionRequest,
  User,
} from '@arcade-hub/contracts'
