import Redis from "ioredis";
import {
	createGameRoom,
	createLobby,
	destroyRoom,
	// exchangeData,
	playerJoin,
	saveAndBrodcastResult,
	// setGameState,
} from "./game";
import { getPublicRooms } from "./lib";

export const redis = new Redis(process.env.REDIS_ENDPOINT as string);
// const room = await redis.call("JSON.GET", `rooms:${"PTSa2"}`);

const server = Bun.serve<{ email: string }>({
	port: process.env.PORT || 3000,
	fetch(req, server) {
		// Add CORS headers
		if (req.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"Access-Control-Allow-Origin": "pvp-rps.vercel.app",
					"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type, Authorization",
					"Access-Control-Allow-Credntials": "true",
				},
			});
		}

		const cookies = req.headers.get("cookie");
		const { email } = getUserFromCookies(cookies);
		const success = server.upgrade(req, {
			data: { email },
			headers: {
				"Access-Control-Allow-Origin": "pvp-rps.vercel.app",
				"Access-Control-Allow-Credentials": "true",
			},
		});
		if (success) return undefined;

		return new Response("Hello world", {
			headers: {
				"Access-Control-Allow-Origin": "*",
			},
		});
	},
	websocket: {
		open(ws) {
			const msg = `${ws.data.email} has entered the chat`;
			console.log(msg);
			// ws.subscribe("the-group-chat");
			// server.publish("the-group-chat", msg);
		},
		message(ws, message) {
			const data = JSON.parse(message as string);
			// console.log(data);

			switch (data.type) {
				case "create_room":
					createLobby(ws, data.player, data.public);
					break;

				case "join_room":
					playerJoin(ws, data.roomId, data.player);
					break;

				// case "finish_exchange_data":
				// 	exchangeData(ws, data.game.id);
				// 	break;

				case "make_choice":
					saveAndBrodcastResult(ws, data.choice, data.game.id);
					break;

				// case "set_game_state":
				// 	setGameState(data.game.id, data.game);
				// 	break;

				case "lobby_to_game":
					createGameRoom(ws, data.game.id);
					break;

				case "announce_left":
					destroyRoom(ws, data.game.id);
					break;

				case "fetch_public_rooms":
					getPublicRooms(ws);
					break;

				default:
					break;
			}
		},
		async close(ws) {
			const msg = `${ws.data.email} has left the chat`;
			// console.log(msg);
			// const roomId = await redis.get(`joined:${ws.data.email}`);

			// server.publish("the-group-chat", msg);
			// if (roomId) ws.unsubscribe(roomId);
		},
	},
});

console.log(`Listening on ${server.hostname}:${server.port}`);

function getUserFromCookies(cookies: string | null) {
	if (!cookies) {
		return { email: "anonymous@example.com" };
	}

	const cookieMap = new Map(
		cookies
			.split(";")
			.map((cookie) => cookie.trim().split("="))
			.filter((parts) => parts.length === 2) as [string, string][],
	);

	const mail = decodeURIComponent(cookieMap.get("email") || "");

	return {
		email: mail,
	};
}
