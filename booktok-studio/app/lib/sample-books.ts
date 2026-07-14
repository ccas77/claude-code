import type { Book } from "./types";

// Seed books so the fan-out is visible instantly with no typing. These stand in
// for rows in the `books` table once the library (M2) is wired to the studio.
export const SAMPLE_BOOKS: Book[] = [
  {
    title: "Vicious Vows",
    author: "Elena Cross",
    blurb:
      "She was the enemy's daughter. He married her to end a war and started a far more dangerous one.",
    quotes: [
      "You don't get to look at me like that and still call me your enemy.",
      "I married you for peace. I stayed for the war you started in my chest.",
      "Say you hate me. Say it and mean it. I dare you.",
      "There is only one bed. He smiled like he'd planned it.",
    ],
    tropes: ["enemies to lovers", "arranged marriage", "one bed", "mafia romance"],
    hashtags: ["booktok", "darkromance", "enemiestolovers", "romancebooks", "spicybooks"],
    audioName: "moody-strings-90bpm",
    vibe: "dark romance, moody, candlelit",
  },
  {
    title: "The Last Light We Keep",
    author: "Marin Hale",
    blurb:
      "Two strangers, one lighthouse, and a storm that won't let either of them leave.",
    quotes: [
      "The sea takes everything. I decided it wasn't taking her.",
      "Grumpy, she called me. I preferred 'weatherproof.'",
      "Stay till morning. The storm was an excuse and we both knew it.",
    ],
    tropes: ["grumpy x sunshine", "forced proximity", "slow burn", "found family"],
    hashtags: ["booktok", "slowburn", "cozyromance", "bookish", "tbr"],
    audioName: "soft-piano-70bpm",
    vibe: "cozy, warm, coastal",
  },
];
