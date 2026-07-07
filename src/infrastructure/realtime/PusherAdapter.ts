import Pusher from "pusher";
import { env } from "@config/env";
import { logger } from "@infrastructure/logger/logger";

// ── Channel name builders ─────────────────────────────────────────────────────
// Centralised here so a typo in one place doesn't silently break subscriptions
export const Channels = {
  user: (userId: string) => `private-user.${userId}`,
  challenge: (challengeId: string) => `presence-challenge.${challengeId}`,
  tournament: (tournamentId: string) => `presence-tournament.${tournamentId}`,
  bet: (betId: string) => `presence-bet.${betId}`,
} as const;

// ── Event names ───────────────────────────────────────────────────────────────
export const Events = {
  // Challenge lifecycle
  CHALLENGE_JOINED: "challenge.joined",
  CHALLENGE_CANCELLED: "challenge.cancelled",
  CHALLENGE_WINNER_DECLARED: "challenge.winner_declared",
  CHALLENGE_SETTLED: "challenge.settled",
  CHALLENGE_DISPUTED: "challenge.disputed",
  CHALLENGE_WAITING: "challenge.waiting",
  CHALLENGE_DISPUTE_EVIDENCE_SUBMITTED: "challenge.dispute_evidence_submitted",

  // Wallet
  WALLET_CREDITED: "wallet.credited",
  WALLET_DEBITED: "wallet.debited",

  // Tournament
  MATCH_RESULT_RECORDED: "match.result_recorded",
  NEXT_MATCH_CREATED: "match.next_created",
  TOURNAMENT_COMPLETED: "tournament.completed",

  // Bets
  BET_ENTRY_PLACED: "bet.entry_placed",
  BET_SETTLED: "bet.settled",
  BET_REFUNDED: "bet.refunded",
} as const;

export type ChannelEvent = (typeof Events)[keyof typeof Events];

// ── Adapter ───────────────────────────────────────────────────────────────────
export class PusherAdapter {
  private readonly client: Pusher;

  constructor() {
    this.client = new Pusher({
      appId: env.PUSHER_APP_ID,
      key: env.PUSHER_KEY,
      secret: env.PUSHER_SECRET,
      cluster: env.PUSHER_CLUSTER,
      useTLS: true,
    });
  }

  // Emit a single event to a channel
  async emit(
    channel: string,
    event: ChannelEvent,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.client.trigger(channel, event, data);
      logger.info({ channel, event }, "Realtime event emitted");
    } catch (error) {
      // Never let a Pusher failure crash a financial operation
      // Log it and continue — the DB is the source of truth
      logger.error({ channel, event, error }, "Pusher emit failed");
    }
  }

  // Emit the same event to multiple channels at once
  async emitToMany(
    channels: string[],
    event: ChannelEvent,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.client.trigger(channels, event, data);
    } catch (error) {
      logger.error({ channels, event, error }, "Pusher multi-emit failed");
    }
  }

  // Sign a channel auth request from the frontend
  // Called by your /pusher/auth endpoint
  authenticateChannel(
    socketId: string,
    channel: string,
    presenceData?: { userId: string; displayName: string },
  ): string {
    if (channel.startsWith("presence-") && presenceData) {
      const auth = this.client.authorizeChannel(socketId, channel, {
        user_id: presenceData.userId,
        user_info: { displayName: presenceData.displayName },
      });
      return JSON.stringify(auth);
    }

    const auth = this.client.authorizeChannel(socketId, channel);
    return JSON.stringify(auth);
  }
}

// Singleton — one Pusher connection for the whole app
export const pusher = new PusherAdapter();