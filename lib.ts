import type { ServerWebSocket } from "bun";
import { redis } from "./index";

export const generateId = (length: number) => {
	let result = "";
	const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
};

export function calculateWinner(input: { [key: string]: string }) {
	function player1Wins(choice1: string, choice2: string) {
		return (
			(choice1 === "rock" && choice2 === "scissor") ||
			(choice1 === "paper" && choice2 === "rock") ||
			(choice1 === "scissor" && choice2 === "paper")
		);
	}
	if (input[Object.keys(input)[0]] === input[Object.keys(input)[1]]) {
		return "tie";
	}
	if (player1Wins(input[Object.keys(input)[0]], input[Object.keys(input)[1]])) {
		return Object.keys(input)[0];
	}
	return Object.keys(input)[1];
}

export const encode = (type: string, data?: { [key: string]: any }) => {
	return JSON.stringify({ type, ...data });
};

async function getKeysByPattern(pattern: string) {
	let cursor = "0";
	const keys: string[] = [];

	do {
		const result = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
		cursor = result[0];
		keys.push(...result[1]);
	} while (cursor !== "0");

	return keys;
}

export async function getPublicRooms(ws: ServerWebSocket<{ email: string }>) {
	const availableRooms = await getKeysByPattern("rooms:*");
	const publicRooms = [];

	for (const roomId of availableRooms) {
		const json = (await redis.call("JSON.GET", roomId)) as string;
		const room = JSON.parse(json);
		if (room?.public) publicRooms.push(room);
	}

	ws.send(encode("get_public_rooms", { rooms: publicRooms }));
}

export interface GameState {
	id: string;
	players: Player[];
	state: "waiting" | "started";
	records?: RoundRecord[];
	currentRound?: {
		choices?: {
			[key: string]: Choice;
		};
		winner?: string;
	};
	public: boolean;
}

interface RoundRecord {
	winner: string;
}

export interface Player {
	username: string;
	avatar: string;
	email: string;
}

export type Choice = "rock" | "paper" | "scissor";
