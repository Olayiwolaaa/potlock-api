export const welcomeEmailTemplate = (diaplayName: string) => `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
    <h2>Welcome to Potlock, ${diaplayName} 🎮</h2>
    <p>You're in. Time to challenge someone, join a tournament, and win real prizes.</p>
    <p>Fund your wallet and jump into your first game from your dashboard.</p>
  </div>
`;

export const feedbackNotificationTemplate = (displayName: string, rating: number, message: string) => `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
    <h3>New feedback — ${"★".repeat(rating)}${"☆".repeat(5 - rating)}</h3>
    <p style="color:#666; font-size:13px;">From user ${displayName}</p>
    <p style="white-space: pre-wrap;">${message}</p>
  </div>
`;
