import { db } from "@infrastructure/db/client";
import { games } from "@infrastructure/db/schema";
import { CloudinaryAdapter } from "@infrastructure/storage/CloudinaryAdapter";
import { redis } from "@infrastructure/cache/RedisClient";
import { CacheKeys } from "@infrastructure/cache/CacheKeys";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const GAME_SEEDS = [
    {
        name: "EA FC 26",
        slug: "ea-fc-26",
        description: "The world's biggest football game. 1v1 matches on PS5, Xbox, PC and Mobile.",
        imageSource: "https://drop-assets.ea.com/images/6g5Yie1DUeAS4zbSBADAr0/0aee1e0e6d4c371042db4ad7b521e377/EAS_FC26_WGE_KeyArt-no-copy-16x9.jpg?im=AspectCrop=(16,9),xPosition=0.5,yPosition=0.5;Resize=(2560)&q=80",
    },
    {
        name: "iMessage Games",
        slug: "imessage-games",
        description: "Play 1v1 games with friends directly in iMessage. Includes 8-ball pool, chess, and more.",
        imageSource: "https://r4.wallpaperflare.com/wallpaper/860/453/96/table-balls-billiards-cue-wallpaper-efec221f9de945f8674d325474730030.jpg",
    },
    {
        name: "Call of Duty: Mobile",
        slug: "call-of-duty-mobile",
        description: "Fast-paced 1v1 gunfights across iconic CoD maps. Mobile only.",
        imageSource: "https://r4.wallpaperflare.com/wallpaper/469/317/242/call-of-duty-4-modern-warfare-call-of-duty-soldier-weapon-wallpaper-9900287de1cafddb5667b8dfb0e196dd.jpg",
    },
    {
        name: "PUBG Mobile",
        slug: "pubg-mobile",
        description: "Battle royale 1v1 custom room challenges on mobile.",
        imageSource: "https://r4.wallpaperflare.com/wallpaper/1001/196/41/pubg-mobile-special-forces-hd-wallpaper-eb41778e46960fcab6773c361e0ca4dd.jpg",
    },
    {
        name: "Mortal Kombat 1",
        slug: "mortal-kombat-1",
        description: "Klassic 1v1 fighting on PS5 and Xbox. Prove your kombat skills.",
        imageSource: "https://r4.wallpaperflare.com/wallpaper/368/918/351/the-game-scorpio-fighter-art-mortal-kombat-hd-wallpaper-132a83fa38f51cfdc872eed371783291.jpg",
    },
    {
        name: "Fortnite",
        slug: "fortnite",
        description: "Battle royale 1v1 custom room challenges on mobile.",
        imageSource: "https://r4.wallpaperflare.com/wallpaper/838/912/1018/fortnite-battle-royale-wallpaper-8960784d41fafdfb3647889f1031361d.jpg",
    },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.warn(`  ⚠ Failed to fetch image from ${url} (${res.status})`);
            return null;
        }
        const contentType = res.headers.get("content-type") ?? "image/jpeg";
        const mimeType = (contentType.split(";")[0] ?? "image/jpeg").trim();
        const arrayBuffer = await res.arrayBuffer();
        return { buffer: Buffer.from(arrayBuffer), mimeType };
    } catch (err) {
        console.warn(`  ⚠ Network error fetching ${url}:`, err);
        return null;
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function seedGames() {
    const storage = new CloudinaryAdapter();

    console.log("🌱 Seeding games...\n");

    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    console.log("🗑  Clearing games table...");
    await db.delete(games);
    console.log("✓ Games table cleared\n");


    for (const seed of GAME_SEEDS) {
        process.stdout.write(`  → ${seed.name} ... `);

        // Idempotency check
        const existing = await db
            .select({ id: games.id })
            .from(games)
            .where(eq(games.slug, seed.slug))
            .limit(1);

        if (existing[0]) {
            console.log("skipped (already exists)");
            skipped++;
            continue;
        }

        // Fetch image
        const image = await fetchImageBuffer(seed.imageSource);
        if (!image) {
            console.log("failed (image fetch error)");
            failed++;
            continue;
        }

        // Validate
        const validation = CloudinaryAdapter.validateImage(image.buffer, image.mimeType);
        if (!validation.valid) {
            console.log(`failed (${validation.error})`);
            failed++;
            continue;
        }

        // Upload to Cloudinary
        const uploaded = await storage.uploadBuffer(
            image.buffer,
            "potlockng/games",
            {
                publicId: `game_${seed.slug}`,
                maxWidth: 800,
                maxHeight: 600,
            },
        );

        if (!uploaded) {
            console.log("failed (Cloudinary upload error)");
            failed++;
            continue;
        }

        // Insert into DB
        await db.insert(games).values({
            id: randomUUID(),
            name: seed.name,
            slug: seed.slug,
            description: seed.description,
            imageUrl: uploaded.url,
            imagePublicId: uploaded.publicId,
            status: "ACTIVE",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        console.log(`done (${uploaded.url.slice(0, 60)}...)`);
        inserted++;
    }

    // Bust cache after all inserts
    if (inserted > 0) {
        await redis.del(CacheKeys.allGames());
        console.log("\n✓ Cache cleared (games:all)");
    }

    console.log(
        `\n✅ Seed complete — ${inserted} inserted, ${skipped} skipped, ${failed} failed`,
    );

    process.exit(failed > 0 ? 1 : 0);
}

seedGames().catch((err) => {
    console.error("Seeder crashed:", err);
    process.exit(1);
});