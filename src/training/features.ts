import type {
  BackgammonBoard,
  BackgammonColor,
  BackgammonPlayMoving,
} from '@nodots-llc/backgammon-types'

export interface ExtractedFeatures {
  // Tensor-like flattened arrays for simple downstream consumption
  points: number[] // length 24; positive for active, negative for opponent
  bar: [number, number] // [active, opponent]
  off: [number, number] // [active, opponent]
  dice: [number, number]
  sideToMove: 0 | 1 // 1 if active is white (normalized), else 0
  activePip: number
  opponentPip: number
  legalMovesCount: number
}

// Simple stable hash for deduplication across similar positions
export function featureHash(f: ExtractedFeatures): string {
  // stringify key parts compactly
  const key = [
    f.points.join(','),
    f.bar.join(','),
    f.off.join(','),
    f.dice.join(','),
    f.sideToMove,
  ].join('|')
  // djb2
  let hash = 5381
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i)
  }
  return (hash >>> 0).toString(16)
}

export function extractFeaturesFromPlay(play: BackgammonPlayMoving): ExtractedFeatures {
  const activeColor: BackgammonColor = play.player.color as BackgammonColor
  const activeDirection: 'clockwise' | 'counterclockwise' = (play as any).player.direction
  const dice: [number, number] = deriveDiceFromPlay(play)
  const points = encodePoints(play.board, activeColor, activeDirection)
  const bar = encodeBar(play.board, activeColor, activeDirection)
  const off = encodeOff(play.board, activeColor, activeDirection)
  const sideToMove: 0 | 1 = activeColor === 'white' ? 1 : 0

  const activePip = (play as any).player?.pipCount ?? 0
  const opponent = (play as any).opponent
  const opponentPip = opponent?.pipCount ?? 0

  const legalMovesCount = (play.moves?.length ?? 0)

  return { points, bar, off, dice, sideToMove, activePip, opponentPip, legalMovesCount }
}

function deriveDiceFromPlay(play: BackgammonPlayMoving): [number, number] {
  const currentRoll = (play as any)?.player?.dice?.currentRoll
  if (Array.isArray(currentRoll) && currentRoll.length === 2) {
    return [currentRoll[0] ?? 0, currentRoll[1] ?? 0]
  }
  return [0, 0]
}

function encodePoints(
  board: BackgammonBoard,
  active: BackgammonColor,
  activeDir: 'clockwise' | 'counterclockwise'
): number[] {
  // 24 points, normalize orientation by active player's direction
  // We map owner checkers to positive if owner === active, else negative
  const arr = new Array<number>(24).fill(0)
  for (const pt of board.points) {
    const idx = toIndexFromOwnerPerspective(pt.position, activeDir)
    let count = 0
    for (const ch of pt.checkers) {
      count += ch.color === active ? 1 : -1
    }
    arr[idx] = count
  }
  return arr
}

function encodeBar(
  board: BackgammonBoard,
  active: BackgammonColor,
  activeDir: 'clockwise' | 'counterclockwise'
): [number, number] {
  const opponentColor: BackgammonColor = active === 'white' ? 'black' : 'white'
  const activeBarDir = activeDir
  const oppBarDir = activeDir === 'clockwise' ? 'counterclockwise' : 'clockwise'
  const activeBar = board.bar[activeBarDir].checkers.filter((c) => c.color === active).length
  const opponentBar = board.bar[oppBarDir].checkers.filter((c) => c.color === opponentColor).length
  return [activeBar, opponentBar]
}

function encodeOff(
  board: BackgammonBoard,
  active: BackgammonColor,
  activeDir: 'clockwise' | 'counterclockwise'
): [number, number] {
  const opponentColor: BackgammonColor = active === 'white' ? 'black' : 'white'
  const activeOffDir = activeDir
  const oppOffDir = activeDir === 'clockwise' ? 'counterclockwise' : 'clockwise'
  const activeOff = board.off[activeOffDir].checkers.filter((c) => c.color === active).length
  const opponentOff = board.off[oppOffDir].checkers.filter((c) => c.color === opponentColor).length
  return [activeOff, opponentOff]
}

function toIndexFromOwnerPerspective(position: any, activeDir: 'clockwise' | 'counterclockwise'): number {
  // position has numeric index from both directions
  // We want 0..23 from active player's bearing off direction
  const dir: 'clockwise' | 'counterclockwise' = (position?.clockwise !== undefined && position?.counterclockwise !== undefined)
    ? 'clockwise'
    : 'clockwise'
  // If owner is clockwise, index is (position.clockwise - 1)
  // If counterclockwise, map to 24 - position.counterclockwise
  const cw = position?.clockwise
  const ccw = position?.counterclockwise
  if (typeof cw === 'number' && typeof ccw === 'number') {
    if (activeDir === 'clockwise') return Math.max(0, Math.min(23, (cw - 1)))
    return Math.max(0, Math.min(23, 24 - ccw))
  }
  return 0
}

