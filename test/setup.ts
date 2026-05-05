// Set test environment variables so env.ts doesn't crash during tests
process.env.APP_ENV = "development";
process.env.PORT = "3000";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/potlockng_test";
process.env.JWT_SECRET = "test-secret-at-least-32-characters-long";
process.env.PAYSTACK_SECRET_KEY = "sk_test_fake";
process.env.PAYSTACK_WEBHOOK_SECRET = "test-webhook-secret";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.PUSHER_APP_ID = "test";
process.env.PUSHER_KEY = "test";
process.env.PUSHER_SECRET = "test";
process.env.PUSHER_CLUSTER = "mt1";