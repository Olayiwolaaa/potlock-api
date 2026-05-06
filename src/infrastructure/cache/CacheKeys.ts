export const CacheKeys = {
  // Games — invalidate when game is created, updated, or status changes
  allGames: () => "games:all",
  game: (id: string) => `games:${id}`,
  gameBySlug: (slug: string) => `games:slug:${slug}`,

  // User profile — invalidate on profile update
  userProfile: (userId: string) => `users:profile:${userId}`,

  // Challenge — invalidate when status changes
  challengeBySlug: (slug: string) => `challenges:slug:${slug}`,

  // Game requests — invalidate when requests change
  pendingGameRequests: () => "game_requests:pending",
} as const;

// TTLs in seconds
export const CacheTTL = {
  GAMES_LIST: 60 * 60,        // 1 hour — game list rarely changes
  GAME_DETAIL: 60 * 60,       // 1 hour
  USER_PROFILE: 60 * 5,       // 5 minutes
  CHALLENGE_SLUG: 60 * 2,     // 2 minutes — challenges change state
  GAME_REQUESTS: 60,           // 1 minute
} as const;