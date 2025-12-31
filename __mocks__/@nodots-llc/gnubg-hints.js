const defaultEvaluation = {
  win: 0,
  winGammon: 0,
  winBackgammon: 0,
  loseGammon: 0,
  loseBackgammon: 0,
  equity: 0,
}

let mockHints = []
let available = true

const MoveFilterSetting = Object.freeze({
  Tiny: 0,
  Narrow: 1,
  Normal: 2,
  Large: 3,
  Huge: 4,
})

class GnuBgHints {
  static async initialize() {
    available = true
  }

  static configure() {
    // noop in mock
  }

  static async getMoveHints(_request, maxHints = mockHints.length) {
    if (!available) {
      throw new Error('Mock addon unavailable')
    }
    return mockHints.slice(0, maxHints)
  }

  static async getDoubleHint(_request) {
    return {
      action: 'no-double',
      takePoint: 0,
      dropPoint: 0,
      evaluation: defaultEvaluation,
      cubefulEquity: 0,
    }
  }

  static async getTakeHint(_request) {
    return {
      action: 'take',
      evaluation: defaultEvaluation,
      takeEquity: 0,
      dropEquity: 0,
    }
  }

  static shutdown() {
    mockHints = []
    available = true
  }

  static __setHints(hints) {
    mockHints = hints
  }

  static __setAvailable(value) {
    available = value
  }
}

function createHintRequestFromGame(game, overrides = {}) {
  const dice = overrides.dice ?? overrides.defaultDice ?? [0, 0]
  const activePlayerColor =
    overrides.activePlayerColor ?? game.activePlayer?.color ?? 'white'
  const activePlayerDirection =
    overrides.activePlayerDirection ?? game.activePlayer?.direction ?? 'clockwise'
  return {
    board: overrides.board ?? game.board,
    dice,
    activePlayerColor,
    activePlayerDirection,
    cubeValue: overrides.cubeValue ?? game.cube?.value ?? 1,
    cubeOwner: overrides.cubeOwner ?? game.cube?.owner?.color ?? null,
    matchScore: overrides.matchScore ?? [0, 0],
    matchLength:
      overrides.matchLength ??
      game?.metadata?.matchLength ??
      game?.matchInfo?.matchLength ??
      0,
    crawford: overrides.crawford ?? false,
    jacoby: overrides.jacoby ?? Boolean(game.rules?.useJacobyRule),
    beavers: overrides.beavers ?? Boolean(game.rules?.useBeaverRule),
  }
}

function __setMockHints(hints) {
  mockHints = hints
}

function __setMockAvailability(value) {
  available = value
}

module.exports = {
  GnuBgHints,
  MoveFilterSetting,
  createHintRequestFromGame,
  __setMockHints,
  __setMockAvailability,
}
