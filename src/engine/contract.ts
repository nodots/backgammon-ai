// Single import site for the engine contract, re-exported from the
// permissive protocol package. Later cells (C1.1) build the EngineProvider
// abstraction on top of these types.
export type {
  AnalysisProvider,
  Evaluation,
  MoveHint,
  MoveStep,
  DoubleHint,
  TakeHint,
  ResignDecision,
  HealthStatus,
  HintRequest,
  Explanation,
  Color,
  Direction,
  Container,
  // HTTP wire response shapes (vendor MAY omit scoring fields, so these are
  // wider than the internal AnalysisProvider return types).
  MoveResponse,
  DoubleResponse,
  TakeResponse,
  ResignResponse,
  HealthResponse,
} from '@nodots/backgammon-engine-protocol'
export { PROTOCOL_VERSION } from '@nodots/backgammon-engine-protocol'
